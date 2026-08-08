import Foundation

/// Geographic helpers for the nearby-photo search.
///
/// Two-stage search: a cheap bounding-box prefilter PostgreSQL can answer from
/// an index, then an exact haversine pass in Swift. Same shape as server/geo.js.
enum Geo {
    private static let earthRadiusM = 6371008.8

    /// Great-circle distance between two coordinates, in metres.
    static func haversineM(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let dLat = (lat2 - lat1) * .pi / 180
        let dLon = (lon2 - lon1) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * earthRadiusM * asin(min(1, sqrt(a)))
    }

    /// Bounding box that fully contains the circle of `radiusM` around a point.
    static func bboxFor(lat: Double, lon: Double, radiusM: Double) -> BoundingBox {
        let latDelta = (radiusM / earthRadiusM) * (180 / .pi)
        let cosLat = cos(lat * .pi / 180)
        let lonDelta = abs(cosLat) < 1e-6
            ? 180.0
            : (radiusM / (earthRadiusM * cosLat)) * (180 / .pi)
        return BoundingBox(
            minLat: lat - latDelta,
            maxLat: lat + latDelta,
            minLon: lon - min(180, abs(lonDelta)),
            maxLon: lon + min(180, abs(lonDelta))
        )
    }

    /// Offset a coordinate by a distance and bearing. Used to scatter seed photos.
    static func offsetCoordinate(
        lat: Double,
        lon: Double,
        distanceM: Double,
        bearingDeg: Double
    ) -> (lat: Double, lon: Double) {
        let bearing = bearingDeg * .pi / 180
        let angular = distanceM / earthRadiusM
        let lat1 = lat * .pi / 180
        let lon1 = lon * .pi / 180
        let lat2 = asin(
            sin(lat1) * cos(angular) + cos(lat1) * sin(angular) * cos(bearing)
        )
        let lon2 = lon1 + atan2(
            sin(bearing) * sin(angular) * cos(lat1),
            cos(angular) - sin(lat1) * sin(lat2)
        )
        let normalizedLon = ((lon2 * 180 / .pi + 540).truncatingRemainder(dividingBy: 360)) - 180
        return (lat: lat2 * 180 / .pi, lon: normalizedLon)
    }
}

struct BoundingBox {
    let minLat: Double
    let maxLat: Double
    let minLon: Double
    let maxLon: Double
}
