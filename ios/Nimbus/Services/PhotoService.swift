import CoreLocation
import Foundation

/// The shared half of Nimbus: leaving photos at a place and finding the ones
/// other people left.
///
/// Kept as a protocol so the local Node server can be swapped for a hosted
/// backend (Supabase, Firebase, anything) without touching a single view.
protocol PhotoService {
    func health() async -> Bool

    /// Announce this device's identity and get back its friend code and current
    /// friends. Safe to call on every launch; it doubles as a rename.
    func register(_ explorer: Explorer) async throws -> RegistrationResponse
    func friends(of viewerID: String) async throws -> [RemoteUser]
    func addFriend(code: String, for viewerID: String) async throws -> AddFriendResponse

    func nearby(coordinate: CLLocationCoordinate2D, viewerID: String) async throws -> NearbyResult
    func photos(inLatitudes latitudes: ClosedRange<Double>,
                longitudes: ClosedRange<Double>,
                viewerID: String) async throws -> [Photo]
    func upload(imageData: Data,
                coordinate: CLLocationCoordinate2D,
                caption: String,
                explorer: Explorer,
                placeName: String?) async throws -> UploadResponse
}

enum PhotoServiceError: LocalizedError {
    case server(status: Int, message: String)
    case unreachable

    var errorDescription: String? {
        switch self {
        case .server(let status, let message): "Server said \(status): \(message)"
        case .unreachable: "Can't reach the Nimbus server. Is `node server.js` running?"
        }
    }
}

/// Talks to server/server.js.
final class NimbusAPI: PhotoService {

    private let baseURL: URL
    private let session: URLSession

    init(baseURL: URL = Config.serverBaseURL) {
        self.baseURL = baseURL

        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 8
        // Seed images are served immutable, so the cache does the heavy lifting
        // when the same photos come back from several searches.
        configuration.requestCachePolicy = .useProtocolCachePolicy
        configuration.urlCache = URLCache(memoryCapacity: 32 << 20, diskCapacity: 256 << 20)
        self.session = URLSession(configuration: configuration)
    }

    func health() async -> Bool {
        do {
            let (_, response) = try await session.data(from: baseURL.appendingPathComponent("health"))
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    func register(_ explorer: Explorer) async throws -> RegistrationResponse {
        try await post(
            "users",
            body: [
                "id": explorer.id,
                "displayName": explorer.displayName,
                "color": explorer.colorHex,
            ]
        )
    }

    func friends(of viewerID: String) async throws -> [RemoteUser] {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("friends"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [URLQueryItem(name: "userId", value: viewerID)]
        let response: FriendListResponse = try await get(components.url!)
        return response.friends
    }

    func addFriend(code: String, for viewerID: String) async throws -> AddFriendResponse {
        try await post("friends", body: ["userId": viewerID, "code": code])
    }

    func nearby(coordinate: CLLocationCoordinate2D, viewerID: String) async throws -> NearbyResult {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("photos/nearby"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "lat", value: String(coordinate.latitude)),
            URLQueryItem(name: "lon", value: String(coordinate.longitude)),
            URLQueryItem(name: "viewerId", value: viewerID),
        ]
        return try await get(components.url!)
    }

    func photos(inLatitudes latitudes: ClosedRange<Double>,
                longitudes: ClosedRange<Double>,
                viewerID: String) async throws -> [Photo] {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("photos/bbox"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "minLat", value: String(latitudes.lowerBound)),
            URLQueryItem(name: "maxLat", value: String(latitudes.upperBound)),
            URLQueryItem(name: "minLon", value: String(longitudes.lowerBound)),
            URLQueryItem(name: "maxLon", value: String(longitudes.upperBound)),
            // Without this the server would hand back everybody's photographs.
            URLQueryItem(name: "viewerId", value: viewerID),
        ]
        let response: PhotoListResponse = try await get(components.url!)
        return response.photos
    }

    func upload(imageData: Data,
                coordinate: CLLocationCoordinate2D,
                caption: String,
                explorer: Explorer,
                placeName: String?) async throws -> UploadResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("photos"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 20

        let body: [String: Any] = [
            "userId": explorer.id,
            "displayName": explorer.displayName,
            "color": explorer.colorHex,
            "lat": coordinate.latitude,
            "lon": coordinate.longitude,
            "caption": caption,
            "takenAt": Date().timeIntervalSince1970 * 1000,
            "placeName": placeName as Any,
            "imageBase64": imageData.base64EncodedString(),
        ].compactMapValues { $0 is NSNull ? nil : $0 }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(request)
    }

    // MARK: Transport

    private func get<T: Decodable>(_ url: URL) async throws -> T {
        try await send(URLRequest(url: url))
    }

    private func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(request)
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw PhotoServiceError.unreachable
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? String(data: data, encoding: .utf8)
                ?? "unknown error"
            throw PhotoServiceError.server(status: status, message: message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
