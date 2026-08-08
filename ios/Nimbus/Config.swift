import CoreGraphics
import CoreLocation
import Foundation

/// Everything tunable in one place, so a demo can be adjusted without hunting.
enum Config {

    // MARK: Server

    /// The shared photo store. Override at launch with the NIMBUS_SERVER
    /// environment variable (Product > Scheme > Edit Scheme > Arguments), or
    /// point it at your Mac's LAN address to run the demo on a real phone.
    static let serverBaseURL: URL = {
        let fallback = "http://localhost:8788"
        let raw = ProcessInfo.processInfo.environment["NIMBUS_SERVER"] ?? fallback
        return URL(string: raw) ?? URL(string: fallback)!
    }()

    // MARK: Exploration (private, on-device)

    /// How much of the world one location fix burns off. Roughly "the couple of
    /// streets you can see from where you are standing".
    static let revealRadiusM: CLLocationDistance = 150

    /// A new fix closer than this to an existing one is dropped. Keeps the
    /// breadcrumb list small enough that the fog renderer stays cheap.
    static let breadcrumbSpacingM: CLLocationDistance = 60

    /// Zoomed out to the whole world, a 150m hole would be far less than a
    /// pixel. Reveals never shrink below this on screen, so your travels stay
    /// legible as a constellation.
    static let minimumRevealScreenPoints: CGFloat = 5

    /// A fix within this distance of a landmark counts as having visited it.
    static let placeArrivalRadiusM: CLLocationDistance = 900

    // MARK: Discovery
    //
    // The server is authoritative for the search; these are for wording the UI
    // before a response comes back.

    static let nearbyPrimaryRadiusM: Double = 100
    static let nearbyFallbackRadiusM: Double = 250

    // MARK: Simulated travel

    /// Walking pace for simulated local movement, in metres per second.
    static let walkingSpeedMps: Double = 22

    /// Beyond this, "travelling" is a flight: you arrive, you do not uncover
    /// the ground in between. This matters — a plane should not burn a line
    /// across the map.
    static let maximumWalkDistanceM: CLLocationDistance = 6_000
}
