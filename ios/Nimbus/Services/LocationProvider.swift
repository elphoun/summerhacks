import CoreLocation
import Foundation

/// Where the app thinks you are.
///
/// Everything downstream — the fog, your history, where a photo gets pinned —
/// consumes this and nothing else, so swapping simulated movement for real GPS
/// is a one-line change in AppModel rather than a rewrite.
@MainActor
protocol LocationProvider: AnyObject {
    var onUpdate: ((CLLocation) -> Void)? { get set }
    var currentLocation: CLLocation? { get }
    func start()
    func stop()
}

/// Movement you can rely on in front of an audience.
///
/// Two ways to arrive somewhere, and the difference is deliberate: walking
/// emits a stream of fixes and burns a trail through the fog, while flying
/// emits a single fix at the destination. A plane should not uncover a stripe
/// across the planet.
@MainActor
final class SimulatedLocationProvider: LocationProvider {

    enum Arrival { case walked, flew }

    var onUpdate: ((CLLocation) -> Void)?
    private(set) var currentLocation: CLLocation?
    private(set) var isMoving = false

    private var timer: Timer?
    private var route: [CLLocationCoordinate2D] = []
    private var routeIndex = 0
    private var completion: ((Arrival) -> Void)?

    func start() {
        if let currentLocation { onUpdate?(currentLocation) }
    }

    func stop() {
        cancelMovement()
    }

    /// Put the explorer somewhere with no journey in between.
    func jump(to coordinate: CLLocationCoordinate2D) {
        cancelMovement()
        emit(coordinate)
    }

    /// Travel to a destination. Short hops are walked (leaving a trail), long
    /// ones are flown (leaving nothing but the arrival).
    func travel(to destination: CLLocationCoordinate2D, completion: ((Arrival) -> Void)? = nil) {
        guard let origin = currentLocation?.coordinate else {
            jump(to: destination)
            completion?(.flew)
            return
        }

        let distance = CLLocation(latitude: origin.latitude, longitude: origin.longitude)
            .distance(from: CLLocation(latitude: destination.latitude, longitude: destination.longitude))

        guard distance <= Config.maximumWalkDistanceM else {
            jump(to: destination)
            completion?(.flew)
            return
        }

        let steps = max(2, Int(distance / (Config.walkingSpeedMps / Double(Self.tickRate))))
        let path = (1...steps).map { step -> CLLocationCoordinate2D in
            let t = Double(step) / Double(steps)
            return CLLocationCoordinate2D(
                latitude: origin.latitude + (destination.latitude - origin.latitude) * t,
                longitude: origin.longitude + (destination.longitude - origin.longitude) * t
            )
        }
        follow(path, completion: completion)
    }

    /// Mill about for a few blocks, the way someone actually explores a place.
    func wander(radiusM: CLLocationDistance = 420, legs: Int = 6, completion: ((Arrival) -> Void)? = nil) {
        guard let origin = currentLocation?.coordinate else { return }

        var path: [CLLocationCoordinate2D] = []
        var cursor = origin
        var bearing = Double.random(in: 0..<360)

        for _ in 0..<legs {
            // Turn a little each leg rather than teleporting in a new direction,
            // so the trail through the fog reads as a walk.
            bearing += Double.random(in: -70...70)
            let legLength = radiusM / Double(legs) * Double.random(in: 1.2...2.2)
            var target = Self.offset(cursor, distanceM: legLength, bearingDegrees: bearing)

            // Keep the walk within `radiusM` of where it started. Without this,
            // several legs in the same general direction drift far enough that
            // you end up streets away from the landmark you just arrived at —
            // and the photos left *at* that landmark fall outside the search.
            let fromOrigin = CLLocation(latitude: origin.latitude, longitude: origin.longitude)
            if fromOrigin.distance(from: CLLocation(latitude: target.latitude, longitude: target.longitude)) > radiusM {
                bearing = Self.bearing(from: cursor, to: origin) + Double.random(in: -50...50)
                target = Self.offset(cursor, distanceM: legLength, bearingDegrees: bearing)
            }
            let steps = max(2, Int(legLength / (Config.walkingSpeedMps / Double(Self.tickRate))))
            for step in 1...steps {
                let t = Double(step) / Double(steps)
                path.append(
                    CLLocationCoordinate2D(
                        latitude: cursor.latitude + (target.latitude - cursor.latitude) * t,
                        longitude: cursor.longitude + (target.longitude - cursor.longitude) * t
                    )
                )
            }
            cursor = target
        }
        follow(path, completion: completion)
    }

    func cancelMovement() {
        timer?.invalidate()
        timer = nil
        route = []
        routeIndex = 0
        isMoving = false
        completion = nil
    }

    // MARK: Internals

    private func follow(_ path: [CLLocationCoordinate2D], completion: ((Arrival) -> Void)?) {
        cancelMovement()
        guard !path.isEmpty else {
            completion?(.walked)
            return
        }

        route = path
        routeIndex = 0
        isMoving = true
        self.completion = completion

        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / Double(Self.tickRate), repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                guard self.routeIndex < self.route.count else {
                    let done = self.completion
                    self.cancelMovement()
                    done?(.walked)
                    return
                }
                self.emit(self.route[self.routeIndex])
                self.routeIndex += 1
            }
        }
    }

    private func emit(_ coordinate: CLLocationCoordinate2D) {
        let location = CLLocation(
            coordinate: coordinate,
            altitude: 0,
            horizontalAccuracy: 8,
            verticalAccuracy: 8,
            timestamp: Date()
        )
        currentLocation = location
        onUpdate?(location)
    }

    /// Initial bearing from one coordinate to another, in degrees.
    static func bearing(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Double {
        let lat1 = from.latitude * .pi / 180
        let lat2 = to.latitude * .pi / 180
        let dLon = (to.longitude - from.longitude) * .pi / 180
        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        return atan2(y, x) * 180 / .pi
    }

    static func offset(_ coordinate: CLLocationCoordinate2D,
                       distanceM: CLLocationDistance,
                       bearingDegrees: Double) -> CLLocationCoordinate2D {
        let earthRadius = 6_371_008.8
        let bearing = bearingDegrees * .pi / 180
        let angular = distanceM / earthRadius
        let lat1 = coordinate.latitude * .pi / 180
        let lon1 = coordinate.longitude * .pi / 180

        let lat2 = asin(sin(lat1) * cos(angular) + cos(lat1) * sin(angular) * cos(bearing))
        let lon2 = lon1 + atan2(
            sin(bearing) * sin(angular) * cos(lat1),
            cos(angular) - sin(lat1) * sin(lat2)
        )
        return CLLocationCoordinate2D(latitude: lat2 * 180 / .pi, longitude: lon2 * 180 / .pi)
    }

    private static let tickRate = 20
}
