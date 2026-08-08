import CoreLocation
import Foundation

/// A memory left at a place. This is the shared half of the app: photos belong
/// to everyone who stands near them, unlike exploration state.
struct Photo: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    let displayName: String
    let color: String
    let lat: Double
    let lon: Double
    /// Epoch milliseconds, as the server stores it.
    let takenAt: Double
    let caption: String
    let placeName: String?
    let imagePath: String

    /// Present on results from a nearby search.
    var distanceM: Int?
    var isYours: Bool?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    var takenDate: Date { Date(timeIntervalSince1970: takenAt / 1000) }

    var imageURL: URL { Config.serverBaseURL.appendingPathComponent(imagePath) }
}

/// The result of a radius search, including which radius actually answered it.
struct NearbyResult: Codable {
    let radiusUsed: Double
    let expanded: Bool
    let primaryRadiusM: Double
    let fallbackRadiusM: Double
    let othersCount: Int
    let photos: [Photo]

    static let empty = NearbyResult(
        radiusUsed: Config.nearbyPrimaryRadiusM,
        expanded: false,
        primaryRadiusM: Config.nearbyPrimaryRadiusM,
        fallbackRadiusM: Config.nearbyFallbackRadiusM,
        othersCount: 0,
        photos: []
    )

    /// Everyone else's photos, which is what the discovery UI is actually about.
    var others: [Photo] { photos.filter { $0.isYours != true } }
}

/// Uploading returns the neighbourhood in the same round trip, because the
/// reveal is the point of taking the photo.
struct UploadResponse: Codable {
    let photo: Photo
    let nearby: NearbyResult
}

struct PhotoListResponse: Codable {
    let photos: [Photo]
}
