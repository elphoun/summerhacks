import Foundation

/// A registered explorer in the shared store.
struct NimbusUser: Codable, Hashable, Identifiable {
    let id: String
    let displayName: String
    let color: String
    let isSeed: Bool

    enum CodingKeys: String, CodingKey {
        case id, color
        case displayName = "display_name"
        case isSeed = "is_seed"
    }
}

/// A memory left at a place — mirrors the shape returned by server/db.js.
struct NimbusPhoto: Codable, Hashable, Identifiable {
    let id: String
    let userId: String
    let displayName: String
    let color: String
    let lat: Double
    let lon: Double
    /// Epoch milliseconds, as PostgreSQL stores it.
    let takenAt: Int64
    let caption: String
    let placeName: String?
    let imagePath: String

    /// Present on radius-search results.
    var distanceM: Int?
    var isYours: Bool?

    enum CodingKeys: String, CodingKey {
        case id, lat, lon, caption, color
        case userId = "user_id"
        case displayName = "display_name"
        case takenAt = "taken_at"
        case placeName = "place_name"
        case imagePath = "image_path"
        case distanceM = "distance_m"
        case isYours = "is_yours"
    }
}

/// Result of the core discovery query (server/db.js `findNearby`).
struct NearbySearchResult: Codable, Hashable {
    let radiusUsed: Double
    let expanded: Bool
    let primaryRadiusM: Double
    let fallbackRadiusM: Double
    let othersCount: Int
    let photos: [NimbusPhoto]

    enum CodingKeys: String, CodingKey {
        case expanded, photos
        case radiusUsed = "radius_used"
        case primaryRadiusM = "primary_radius_m"
        case fallbackRadiusM = "fallback_radius_m"
        case othersCount = "others_count"
    }
}

/// Discovery search tuning — mirrors server/config.json.
struct NearbySearchConfig: Codable, Hashable {
    let primaryRadiusM: Double
    let fallbackRadiusM: Double
    let minResults: Int

    static let `default` = NearbySearchConfig(
        primaryRadiusM: 100,
        fallbackRadiusM: 250,
        minResults: 3
    )
}

// MARK: - Database row types (PostgREST)

struct UserRow: Codable {
    let id: String
    let displayName: String
    let color: String
    let isSeed: Bool

    enum CodingKeys: String, CodingKey {
        case id, color
        case displayName = "display_name"
        case isSeed = "is_seed"
    }

    var asUser: NimbusUser {
        NimbusUser(id: id, displayName: displayName, color: color, isSeed: isSeed)
    }
}

struct UserInsert: Encodable {
    let id: String
    let displayName: String
    let color: String
    let isSeed: Bool

    enum CodingKeys: String, CodingKey {
        case id, color
        case displayName = "display_name"
        case isSeed = "is_seed"
    }
}

struct PhotoInsert: Encodable {
    let id: String
    let userId: String
    let lat: Double
    let lon: Double
    let takenAt: Int64
    let caption: String
    let mediaFile: String
    let placeName: String?

    enum CodingKeys: String, CodingKey {
        case id, lat, lon, caption
        case userId = "user_id"
        case takenAt = "taken_at"
        case mediaFile = "media_file"
        case placeName = "place_name"
    }
}

struct PhotoRow: Decodable {
    let id: String
    let userId: String
    let lat: Double
    let lon: Double
    let takenAt: Int64
    let caption: String
    let mediaFile: String
    let placeName: String?
    let users: UserJoin

    struct UserJoin: Decodable {
        let displayName: String
        let color: String

        enum CodingKeys: String, CodingKey {
            case displayName = "display_name"
            case color
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, lat, lon, caption, users
        case userId = "user_id"
        case takenAt = "taken_at"
        case mediaFile = "media_file"
        case placeName = "place_name"
    }

    func asPhoto(imagePath: String, distanceM: Int? = nil, isYours: Bool? = nil) -> NimbusPhoto {
        NimbusPhoto(
            id: id,
            userId: userId,
            displayName: users.displayName,
            color: users.color,
            lat: lat,
            lon: lon,
            takenAt: takenAt,
            caption: caption,
            placeName: placeName,
            imagePath: imagePath,
            distanceM: distanceM,
            isYours: isYours
        )
    }
}
