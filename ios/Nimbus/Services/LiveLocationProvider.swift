import CoreLocation
import Foundation

/// Real device GPS, behind the same protocol as the simulator.
///
/// Turning this into true background exploration — the app uncovering your map
/// while it is in your pocket — needs no changes elsewhere:
///
///   1. `requestAlwaysAuthorization()` instead of when-in-use (the Info.plist
///      string is already there),
///   2. set `allowsBackgroundLocationUpdates = true` (the background mode is
///      already declared),
///   3. for battery, switch to `startMonitoringSignificantLocationChanges()`,
///      which wakes the app every ~500m — about the granularity the fog uses
///      anyway.
///
/// Everything downstream already treats fixes as arriving whenever they arrive.
/// `CLLocationManager` delivers its callbacks on the queue it was created on —
/// the main queue here — so the conformance is sound; `@preconcurrency` tells
/// the compiler that rather than fighting the un-annotated delegate protocol.
@MainActor
final class LiveLocationProvider: NSObject, LocationProvider, @preconcurrency CLLocationManagerDelegate {

    var onUpdate: ((CLLocation) -> Void)?
    private(set) var currentLocation: CLLocation?

    /// Surfaced so the UI can explain a refusal instead of silently doing nothing.
    var onAuthorizationChange: ((CLAuthorizationStatus) -> Void)?

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 25
    }

    var authorizationStatus: CLAuthorizationStatus { manager.authorizationStatus }

    func start() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.startUpdatingLocation()
    }

    func stop() {
        manager.stopUpdatingLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        currentLocation = location
        onUpdate?(location)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        onAuthorizationChange?(manager.authorizationStatus)
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
            manager.startUpdatingLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // A simulator with no location set fails here constantly; it is not
        // worth surfacing, the simulated provider is the default anyway.
        NSLog("[Nimbus] location error: \(error.localizedDescription)")
    }
}
