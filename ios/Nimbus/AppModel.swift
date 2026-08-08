import CoreLocation
import MapKit
import SwiftUI

/// Holds the two halves of Nimbus and keeps them apart.
///
/// `exploration` is private to this device and never leaves it. `service` is
/// the shared photo store. The only place they meet is `visiblePhotos`, which
/// is twice narrowed: to photographs left by your friends, and then to ground
/// *you* have uncovered.
@MainActor
final class AppModel: ObservableObject {

    // MARK: Published state

    /// This device's one identity.
    @Published private(set) var explorer: Explorer
    @Published private(set) var friends: [RemoteUser] = []
    @Published private(set) var exploration: ExplorationStore

    @Published private(set) var location: CLLocation?
    @Published private(set) var explorationPoints: [ExploredPoint] = []
    /// Increments whenever the fog changes, which is what makes the map redraw.
    @Published private(set) var fogVersion = 0

    @Published private(set) var visiblePhotos: [Photo] = []
    @Published private(set) var hiddenPhotoCount = 0

    @Published private(set) var serverReachable: Bool?
    @Published private(set) var isTravelling = false
    @Published var focus: MapFocus?
    @Published var followsUser = false
    @Published var banner: Banner?

    @Published var usingRealGPS = false {
        didSet { switchProvider() }
    }

    struct Banner: Identifiable, Equatable {
        let id = UUID()
        let text: String
        var isError = false
    }

    // MARK: Collaborators

    let simulated = SimulatedLocationProvider()
    let live = LiveLocationProvider()
    private let service: PhotoService

    /// Everything the last bbox query returned, before the exploration gate.
    private var photosInView: [Photo] = []
    private var focusToken = 0
    private var lastRegion: MKCoordinateRegion?
    private var regionFetch: Task<Void, Never>?

    // MARK: Lifecycle

    init(explorer: Explorer = LocalIdentity.loadOrCreate(), service: PhotoService = NimbusAPI()) {
        self.explorer = explorer
        self.exploration = ExplorationStore(explorerID: explorer.id)
        self.service = service

        simulated.onUpdate = { [weak self] location in self?.handle(location) }
        live.onUpdate = { [weak self] location in self?.handle(location) }
        live.onAuthorizationChange = { [weak self] status in self?.handleAuthorization(status) }

        explorationPoints = exploration.points

        // Pick up where this device left off, or open on the starting landmark
        // if the map has never been anywhere.
        let start = exploration.lastCoordinate ?? Place.home.coordinate
        simulated.jump(to: start)
        focusMap(on: start, metres: 2_600, animated: false)
    }

    private func switchProvider() {
        // Stopping a provider cancels any walk in flight *without* running its
        // completion handler, so the travelling flag has to be cleared here or
        // it sticks on for the rest of the session.
        simulated.stop()
        live.stop()
        isTravelling = false
        followsUser = false

        if usingRealGPS {
            live.start()
        } else {
            simulated.start()
        }
    }

    /// Say what actually happened when the GPS switch is flipped, including the
    /// case where the person taps "Don't Allow".
    private func handleAuthorization(_ status: CLAuthorizationStatus) {
        guard usingRealGPS else { return }
        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            banner = Banner(text: "Using this device's real GPS.")
        case .denied, .restricted:
            usingRealGPS = false
            banner = Banner(
                text: "Location is off for Nimbus. Turn it on in Settings, or keep using simulated travel.",
                isError: true
            )
        default:
            break
        }
    }

    // MARK: Location

    private func handle(_ location: CLLocation) {
        self.location = location
        let uncoveredSomethingNew = exploration.record(location)

        if uncoveredSomethingNew {
            explorationPoints = exploration.points
            fogVersion += 1
            applyExplorationGate()
        }
    }

    /// Fly or walk to a destination, then have a look around — a short wander
    /// makes the reveal look like a person moving through a place rather than a
    /// stamped circle.
    func travel(to coordinate: CLLocationCoordinate2D, named name: String?) {
        simulated.cancelMovement()
        usingRealGPS = false
        isTravelling = true
        followsUser = true
        focusMap(on: coordinate, metres: 1_400, animated: true)

        simulated.travel(to: coordinate) { [weak self] arrival in
            guard let self else { return }
            if arrival == .flew {
                self.banner = Banner(text: name.map { "Arrived at \($0)." } ?? "Arrived.")
            }
            // Deliberately small: arriving somewhere should leave you *at* it,
            // close enough that the memories people left there are within the
            // 100m search. "Walk around here" is the way to cover more ground.
            self.simulated.wander(radiusM: 60, legs: 3) { [weak self] _ in
                guard let self else { return }
                self.isTravelling = false
                self.followsUser = false
                Task { await self.refreshPhotosForCurrentRegion() }
            }
        }
    }

    func travel(to place: Place) {
        travel(to: place.coordinate, named: place.name)
    }

    /// Mill about where you already are, uncovering a few more streets.
    func wanderHere() {
        guard !isTravelling else { return }
        usingRealGPS = false
        isTravelling = true
        followsUser = true
        simulated.wander(radiusM: 500, legs: 7) { [weak self] _ in
            guard let self else { return }
            self.isTravelling = false
            self.followsUser = false
            Task { await self.refreshPhotosForCurrentRegion() }
        }
    }

    func centreOnMe() {
        guard let coordinate = location?.coordinate else { return }
        focusMap(on: coordinate, metres: 1_200, animated: true)
    }

    func focusMap(on coordinate: CLLocationCoordinate2D, metres: Double, animated: Bool) {
        focusToken += 1
        focus = MapFocus(
            token: focusToken,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            metres: metres,
            animated: animated
        )
    }

    // MARK: Photos (shared)

    func checkServer() async {
        let reachable = await service.health()
        serverReachable = reachable
        guard reachable else {
            banner = Banner(
                text: "Can't reach the photo server at \(Config.serverBaseURL.absoluteString) — run `node server.js`.",
                isError: true
            )
            return
        }
        await register()
        await refreshPhotosForCurrentRegion()
    }

    // MARK: Identity and friends

    /// Tell the server who this device is. Idempotent, and how a rename reaches
    /// the people who can see your photographs.
    func register() async {
        do {
            let response = try await service.register(explorer)
            explorer.friendCode = response.user.friendCode
            LocalIdentity.save(explorer)
            friends = response.friends
        } catch {
            // Not fatal — photographs still load. Only the friend code and the
            // friend list go missing, so say so rather than showing a blank.
            banner = Banner(text: "Couldn't reach the server to register. \(error.localizedDescription)", isError: true)
        }
    }

    func rename(to newName: String) {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != explorer.displayName else { return }

        explorer.displayName = trimmed
        LocalIdentity.save(explorer)
        Task { await register() }
    }

    enum AddFriendOutcome {
        case added(String)
        case failed(String)
    }

    func addFriend(code: String) async -> AddFriendOutcome {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !trimmed.isEmpty else { return .failed("Enter a code first.") }

        do {
            let response = try await service.addFriend(code: trimmed, for: explorer.id)
            friends = response.friends
            // Their photographs were invisible a moment ago; make them appear
            // without waiting for the next pan.
            await refreshPhotosForCurrentRegion()
            return .added(response.friend.displayName)
        } catch let PhotoServiceError.server(_, message) {
            return .failed(message)
        } catch {
            return .failed(error.localizedDescription)
        }
    }

    func refreshFriends() async {
        guard let updated = try? await service.friends(of: explorer.id) else { return }
        friends = updated
    }

    /// The map reports region changes continuously — every frame of a pan, and
    /// every simulated step while the camera follows a walk. Coalesce them so
    /// one gesture costs one request.
    func regionChanged(_ region: MKCoordinateRegion) {
        lastRegion = region
        regionFetch?.cancel()
        regionFetch = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await self?.refreshPhotos(in: region)
        }
    }

    private func refreshPhotosForCurrentRegion() async {
        guard let region = lastRegion else { return }
        await refreshPhotos(in: region)
    }

    private func refreshPhotos(in region: MKCoordinateRegion) async {
        // A whole-world request would drag back every photo in the database for
        // ground the explorer almost certainly cannot see anyway.
        guard region.span.latitudeDelta < 12 else { return }

        let latitudes = (region.center.latitude - region.span.latitudeDelta / 2)
            ... (region.center.latitude + region.span.latitudeDelta / 2)
        let longitudes = (region.center.longitude - region.span.longitudeDelta / 2)
            ... (region.center.longitude + region.span.longitudeDelta / 2)

        do {
            photosInView = try await service.photos(
                inLatitudes: latitudes,
                longitudes: longitudes,
                viewerID: explorer.id
            )
            serverReachable = true
            applyExplorationGate()
        } catch {
            serverReachable = false
        }
    }

    /// The one rule connecting the private half to the shared half: you cannot
    /// see what your friends left somewhere you have never been.
    private func applyExplorationGate() {
        let visible = photosInView.filter { exploration.isExplored($0.coordinate) }
        visiblePhotos = visible
        hiddenPhotoCount = photosInView.count - visible.count
    }

    // MARK: Capture

    struct CaptureOutcome {
        let photo: Photo
        let nearby: NearbyResult
    }

    func leavePhoto(imageData: Data, caption: String) async -> CaptureOutcome? {
        guard let coordinate = location?.coordinate else {
            banner = Banner(text: "No location yet.", isError: true)
            return nil
        }

        do {
            let response = try await service.upload(
                imageData: imageData,
                coordinate: coordinate,
                caption: caption,
                explorer: explorer,
                placeName: Place.nearest(to: coordinate)?.name
            )
            exploration.notePhotoLeft()
            await refreshPhotosForCurrentRegion()
            return CaptureOutcome(photo: response.photo, nearby: response.nearby)
        } catch {
            banner = Banner(text: error.localizedDescription, isError: true)
            return nil
        }
    }

    // MARK: Demo helpers

    /// Cloud this device's map back over, so a demo can be run twice. Nothing
    /// anyone has left in the world is touched.
    func resetExploration() {
        exploration.reset()
        explorationPoints = []
        fogVersion += 1
        applyExplorationGate()

        // `jump` cancels any walk in flight without running its completion.
        isTravelling = false
        followsUser = false
        simulated.jump(to: Place.home.coordinate)
        focusMap(on: Place.home.coordinate, metres: 90_000, animated: true)
        banner = Banner(text: "Your map is clouded over again.")
    }

    var currentPlaceName: String? {
        location.flatMap { Place.nearest(to: $0.coordinate)?.name }
    }
}
