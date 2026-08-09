import Foundation
import Supabase

/// PostgreSQL-backed storage for the shared half of Nimbus.
///
/// Direct Swift port of server/db.js: users, photos, radius search, and the
/// primary/fallback discovery query. Uses Supabase (PostgREST) instead of SQLite.
actor NimbusDatabase {
    private let client: SupabaseClient
    private let mediaBucket: String

    init(client: SupabaseClient = NimbusSupabase.client, mediaBucket: String = NimbusSupabase.mediaBucket) {
        self.client = client
        self.mediaBucket = mediaBucket
    }

    // MARK: Users

    @discardableResult
    func upsertUser(id: String, displayName: String, color: String, isSeed: Bool = false) async throws -> NimbusUser {
        let row = UserInsert(id: id, displayName: displayName, color: color, isSeed: isSeed)
        let saved: UserRow = try await client
            .from("users")
            .upsert(row, onConflict: "id")
            .select()
            .single()
            .execute()
            .value
        return saved.asUser
    }

    func listUsers() async throws -> [NimbusUser] {
        let rows: [UserRow] = try await client
            .from("users")
            .select()
            .order("is_seed")
            .order("display_name")
            .execute()
            .value
        return rows.map(\.asUser)
    }

    // MARK: Photos

    func insertPhoto(
        id: String,
        userId: String,
        lat: Double,
        lon: Double,
        takenAt: Int64,
        caption: String = "",
        mediaFile: String,
        placeName: String? = nil
    ) async throws -> NimbusPhoto {
        let row = PhotoInsert(
            id: id,
            userId: userId,
            lat: lat,
            lon: lon,
            takenAt: takenAt,
            caption: caption,
            mediaFile: mediaFile,
            placeName: placeName
        )
        try await client
            .from("photos")
            .insert(row)
            .execute()

        guard let photo = try await getPhoto(id: id) else {
            throw NimbusDatabaseError.photoNotFound(id)
        }
        return photo
    }

    func getPhoto(id: String) async throws -> NimbusPhoto? {
        let rows: [PhotoRow] = try await client
            .from("photos")
            .select(photoSelect)
            .eq("id", value: id)
            .limit(1)
            .execute()
            .value
        guard let row = rows.first else { return nil }
        return row.asPhoto(imagePath: publicMediaPath(for: row.mediaFile))
    }

    func countPhotos() async throws -> Int {
        let count = try await client
            .from("photos")
            .select("*", head: true, count: .exact)
            .execute()
            .count
        return count ?? 0
    }

    /// Every photo within `radiusM` of a point, nearest first.
    func findWithinRadius(lat: Double, lon: Double, radiusM: Double) async throws -> [NimbusPhoto] {
        let box = Geo.bboxFor(lat: lat, lon: lon, radiusM: radiusM)
        let rows: [PhotoRow] = try await client
            .from("photos")
            .select(photoSelect)
            .gte("lat", value: box.minLat)
            .lte("lat", value: box.maxLat)
            .gte("lon", value: box.minLon)
            .lte("lon", value: box.maxLon)
            .execute()
            .value

        return rows
            .map { row -> NimbusPhoto in
                let distance = Int(Geo.haversineM(lat1: lat, lon1: lon, lat2: row.lat, lon2: row.lon).rounded())
                return row.asPhoto(
                    imagePath: publicMediaPath(for: row.mediaFile),
                    distanceM: distance
                )
            }
            .filter { ($0.distanceM ?? Int.max) <= Int(radiusM.rounded()) }
            .sorted { ($0.distanceM ?? 0) < ($1.distanceM ?? 0) }
    }

    /// The core discovery query — mirrors server/db.js `findNearby`.
    func findNearby(
        lat: Double,
        lon: Double,
        viewerId: String? = nil,
        config: NearbySearchConfig = .default
    ) async throws -> NearbySearchResult {
        var radiusUsed = config.primaryRadiusM
        var photos = try await findWithinRadius(lat: lat, lon: lon, radiusM: config.primaryRadiusM)
        var expanded = false

        if countOthers(in: photos, viewerId: viewerId) < config.minResults {
            radiusUsed = config.fallbackRadiusM
            expanded = true
            photos = try await findWithinRadius(lat: lat, lon: lon, radiusM: config.fallbackRadiusM)
        }

        let flagged = photos.map { photo -> NimbusPhoto in
            var copy = photo
            copy.isYours = photo.userId == viewerId
            return copy
        }

        return NearbySearchResult(
            radiusUsed: radiusUsed,
            expanded: expanded,
            primaryRadiusM: config.primaryRadiusM,
            fallbackRadiusM: config.fallbackRadiusM,
            othersCount: countOthers(in: flagged, viewerId: viewerId),
            photos: flagged
        )
    }

    /// Photos in a map bounding box — mirrors GET /photos/bbox.
    func photosInBBox(minLat: Double, maxLat: Double, minLon: Double, maxLon: Double, limit: Int = 500) async throws -> [NimbusPhoto] {
        let rows: [PhotoRow] = try await client
            .from("photos")
            .select(photoSelect)
            .gte("lat", value: minLat)
            .lte("lat", value: maxLat)
            .gte("lon", value: minLon)
            .lte("lon", value: maxLon)
            .limit(limit)
            .execute()
            .value

        return rows.map { $0.asPhoto(imagePath: publicMediaPath(for: $0.mediaFile)) }
    }

    // MARK: Media

    /// Upload bytes to Supabase Storage and return the stored file name.
    func uploadMedia(id: String, data: Data) async throws -> String {
        let file = "\(id)\(sniffExtension(data: data))"
        try await client.storage
            .from(mediaBucket)
            .upload(
                path: file,
                file: data,
                options: FileOptions(contentType: mimeType(for: file), upsert: true)
            )
        return file
    }

    func publicMediaURL(for mediaFile: String) -> URL {
        client.storage.from(mediaBucket).getPublicURL(path: mediaFile)
    }

    // MARK: Private

    private let photoSelect = """
        id, user_id, lat, lon, taken_at, caption, media_file, place_name,
        users!inner(display_name, color)
        """

    private func publicMediaPath(for mediaFile: String) -> String {
        publicMediaURL(for: mediaFile).absoluteString
    }

    private func countOthers(in photos: [NimbusPhoto], viewerId: String?) -> Int {
        photos.filter { $0.userId != viewerId }.count
    }

    private func sniffExtension(data: Data) -> String {
        guard data.count > 2 else { return ".png" }
        if data.count > 8, data[0] == 0x89, data[1] == 0x50 { return ".png" }
        if data[0] == 0xff, data[1] == 0xd8 { return ".jpg" }
        return ".png"
    }

    private func mimeType(for file: String) -> String {
        switch (file as NSString).pathExtension.lowercased() {
        case "jpg", "jpeg": "image/jpeg"
        case "heic": "image/heic"
        default: "image/png"
        }
    }
}

enum NimbusDatabaseError: LocalizedError {
    case photoNotFound(String)

    var errorDescription: String? {
        switch self {
        case .photoNotFound(let id): "Photo \(id) was not found after insert."
        }
    }
}
