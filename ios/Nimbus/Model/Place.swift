import CoreLocation
import Foundation

/// A landmark used for travel presets and for naming places in your history.
///
/// Coordinates mirror server/places.js, where the seed photographs are
/// clustered. Keep the two in sync if you add somewhere.
struct Place: Identifiable, Hashable {
    let id: String
    let name: String
    let city: String
    let country: String
    let latitude: Double
    let longitude: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var location: CLLocation { CLLocation(latitude: latitude, longitude: longitude) }
}

extension Place {
    static let all: [Place] = [
        Place(id: "eiffel", name: "Eiffel Tower", city: "Paris", country: "France", latitude: 48.8584, longitude: 2.2945),
        Place(id: "golden-gate", name: "Golden Gate Bridge", city: "San Francisco", country: "USA", latitude: 37.8199, longitude: -122.4783),
        Place(id: "shibuya", name: "Shibuya Crossing", city: "Tokyo", country: "Japan", latitude: 35.6595, longitude: 139.7005),
        Place(id: "times-square", name: "Times Square", city: "New York", country: "USA", latitude: 40.7580, longitude: -73.9855),
        Place(id: "sagrada", name: "Sagrada Família", city: "Barcelona", country: "Spain", latitude: 41.4036, longitude: 2.1744),
        Place(id: "colosseum", name: "Colosseum", city: "Rome", country: "Italy", latitude: 41.8902, longitude: 12.4922),
        Place(id: "opera-house", name: "Sydney Opera House", city: "Sydney", country: "Australia", latitude: -33.8568, longitude: 151.2153),
        Place(id: "marina-bay", name: "Marina Bay Sands", city: "Singapore", country: "Singapore", latitude: 1.2834, longitude: 103.8607),
        Place(id: "table-mountain", name: "Table Mountain", city: "Cape Town", country: "South Africa", latitude: -33.9628, longitude: 18.4098),
        Place(id: "griffith", name: "Griffith Observatory", city: "Los Angeles", country: "USA", latitude: 34.1184, longitude: -118.3004),
        Place(id: "brooklyn-bridge", name: "Brooklyn Bridge", city: "New York", country: "USA", latitude: 40.7061, longitude: -73.9969),
        Place(id: "trevi", name: "Trevi Fountain", city: "Rome", country: "Italy", latitude: 41.9009, longitude: 12.4833),
    ]

    /// The landmark you are standing at, if any.
    static func nearest(to coordinate: CLLocationCoordinate2D,
                        within radius: CLLocationDistance = Config.placeArrivalRadiusM) -> Place? {
        let here = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        return all
            .map { ($0, here.distance(from: $0.location)) }
            .filter { $0.1 <= radius }
            .min { $0.1 < $1.1 }?
            .0
    }
}
