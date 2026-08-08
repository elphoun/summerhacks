import Foundation

/// SwiftUI-friendly facade over `NimbusDatabase`.
///
/// Mirrors the HTTP surface of server/server.js so the iOS app can swap
/// `NimbusAPI` for this type without changing any view code. All operations
/// talk directly to Supabase PostgreSQL + Storage using keys from `.env`.
@MainActor
@Observable
final class NimbusPhotoStore {
    private let database: NimbusDatabase
    let searchConfig: NearbySearchConfig
    let maxUploadBytes: Int

    var photoCount: Int = 0
    var lastError: String?

    init(
        database: NimbusDatabase = NimbusDatabase(),
        searchConfig: NearbySearchConfig = .default,
        maxUploadBytes: Int = 12_000_000
    ) {
        self.database = database
        self.searchConfig = searchConfig
        self.maxUploadBytes = maxUploadBytes
    }

    // MARK: Health / users (GET /health, /users, POST /users)

    func refreshHealth() async -> Bool {
        do {
            photoCount = try await database.countPhotos()
            lastError = nil
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func listUsers() async throws -> [NimbusUser] {
        try await database.listUsers()
    }

    @discardableResult
    func registerUser(id: String, displayName: String, color: String = "#6EA8FF") async throws -> NimbusUser {
        try await database.upsertUser(id: id, displayName: displayName, color: color, isSeed: false)
    }

    // MARK: Discovery (GET /photos/nearby, /photos/bbox)

    func nearby(lat: Double, lon: Double, viewerId: String?) async throws -> NearbySearchResult {
        try await database.findNearby(
            lat: lat,
            lon: lon,
            viewerId: viewerId,
            config: searchConfig
        )
    }

    func photosInBBox(minLat: Double, maxLat: Double, minLon: Double, maxLon: Double) async throws -> [NimbusPhoto] {
        try await database.photosInBBox(
            minLat: minLat,
            maxLat: maxLat,
            minLon: minLon,
            maxLon: maxLon
        )
    }

    func photo(id: String) async throws -> NimbusPhoto? {
        try await database.getPhoto(id: id)
    }

    // MARK: Upload (POST /photos)

    struct UploadResult {
        let photo: NimbusPhoto
        let nearby: NearbySearchResult
    }

    func uploadPhoto(
        imageData: Data,
        userId: String,
        displayName: String = "Explorer",
        color: String = "#6EA8FF",
        lat: Double,
        lon: Double,
        caption: String = "",
        takenAt: Int64? = nil,
        placeName: String? = nil
    ) async throws -> UploadResult {
        guard !imageData.isEmpty else {
            throw NimbusPhotoStoreError.badRequest("image data was empty")
        }
        guard imageData.count <= maxUploadBytes else {
            throw NimbusPhotoStoreError.badRequest("image too large")
        }

        try await database.upsertUser(id: userId, displayName: displayName, color: color)

        let id = UUID().uuidString.lowercased()
        let mediaFile = try await database.uploadMedia(id: id, data: imageData)
        let trimmedCaption = String(caption.prefix(280))
        let taken = takenAt ?? Int64(Date().timeIntervalSince1970 * 1000)

        var photo = try await database.insertPhoto(
            id: id,
            userId: userId,
            lat: lat,
            lon: lon,
            takenAt: taken,
            caption: trimmedCaption,
            mediaFile: mediaFile,
            placeName: placeName
        )
        photo.isYours = true
        photo.distanceM = 0

        let nearby = try await database.findNearby(
            lat: lat,
            lon: lon,
            viewerId: userId,
            config: searchConfig
        )

        photoCount = try await database.countPhotos()
        return UploadResult(photo: photo, nearby: nearby)
    }
}

enum NimbusPhotoStoreError: LocalizedError {
    case badRequest(String)

    var errorDescription: String? {
        switch self {
        case .badRequest(let message): message
        }
    }
}
