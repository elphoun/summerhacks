import CoreLocation
import Foundation

/// One place you stood, and the circle of world it burned off your fog.
struct ExploredPoint: Codable, Hashable {
    let latitude: Double
    let longitude: Double
    let discoveredAt: Date
    let radiusM: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

/// The first time you reached a named landmark.
struct Visit: Codable, Identifiable, Hashable {
    let id: String
    let placeName: String
    let city: String
    let country: String
    let firstSeen: Date
}

/// Everything one explorer has uncovered.
///
/// This is the private half of Nimbus and it is private *structurally*: the
/// file lives in this app's container, keyed by explorer, and no part of the
/// API layer can read it. Another user travelling somewhere cannot uncover it
/// for you, because their travels never leave their own device.
@MainActor
final class ExplorationStore: ObservableObject {

    let explorerID: String

    @Published private(set) var points: [ExploredPoint] = []
    @Published private(set) var visits: [Visit] = []
    @Published private(set) var photosLeft: Int = 0
    /// Where this explorer was when you last switched away from them.
    @Published private(set) var lastCoordinate: CLLocationCoordinate2D?

    /// Fine grid of covered cells, kept incrementally for the area statistic.
    private var coveredCells: Set<Cell> = []
    /// Coarse spatial index so `isExplored` does not scan every breadcrumb.
    private var index: [Cell: [Int]] = [:]

    private let fileURL: URL

    /// `directory` is injectable so the logic tests can run against a temporary
    /// folder instead of the real container.
    init(explorerID: String, directory: URL? = nil) {
        self.explorerID = explorerID
        self.fileURL = (directory ?? Self.directory())
            .appendingPathComponent("exploration-\(explorerID).json")
        load()
    }

    // MARK: Recording

    /// Record a location fix. Returns true if this actually uncovered new
    /// ground, which is the cue for the map to redraw.
    @discardableResult
    func record(_ location: CLLocation) -> Bool {
        lastCoordinate = location.coordinate
        noteArrival(at: location.coordinate)

        if isTooCloseToExistingPoint(location.coordinate) {
            save()
            return false
        }

        let point = ExploredPoint(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            discoveredAt: Date(),
            radiusM: Config.revealRadiusM
        )
        points.append(point)
        addToIndex(point, at: points.count - 1)
        addCoverage(for: point)
        save()
        return true
    }

    func notePhotoLeft() {
        photosLeft += 1
        save()
    }

    /// Wipes this explorer back to a fresh install. Only they are affected.
    func reset() {
        points = []
        visits = []
        photosLeft = 0
        coveredCells = []
        index = [:]
        lastCoordinate = nil
        save()
    }

    // MARK: Queries

    /// Has this explorer uncovered this spot? Gates whether other people's
    /// photos here are visible at all.
    func isExplored(_ coordinate: CLLocationCoordinate2D) -> Bool {
        let target = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        for cell in Cell(coordinate, size: Self.indexCellSize).neighbourhood {
            for i in index[cell] ?? [] {
                let point = points[i]
                if target.distance(from: CLLocation(latitude: point.latitude, longitude: point.longitude)) <= point.radiusM {
                    return true
                }
            }
        }
        return false
    }

    var hasExploredAnywhere: Bool { !points.isEmpty }

    /// Approximate uncovered area, from the fine coverage grid rather than by
    /// summing circles, so overlapping breadcrumbs are not double counted.
    var uncoveredAreaKm2: Double {
        coveredCells.reduce(into: 0.0) { total, cell in
            let latitude = (Double(cell.y) + 0.5) * Self.coverageCellSize
            let metres = Self.coverageCellSize * 111_320
            total += metres * metres * cos(latitude * .pi / 180) / 1_000_000
        }
    }

    var placesDiscovered: Int { visits.count }

    var mostRecentVisits: [Visit] { visits.sorted { $0.firstSeen > $1.firstSeen } }

    /// Straight-line distance covered between consecutive breadcrumbs — an
    /// underestimate of the true path, but a real one, not a guess.
    var totalDistanceM: Double {
        guard points.count > 1 else { return 0 }
        var total = 0.0
        for i in 1..<points.count {
            let a = CLLocation(latitude: points[i - 1].latitude, longitude: points[i - 1].longitude)
            let b = CLLocation(latitude: points[i].latitude, longitude: points[i].longitude)
            total += a.distance(from: b)
        }
        return total
    }

    /// A rough step count from distance covered, at an average stride of 0.75m.
    var estimatedSteps: Int { Int(totalDistanceM / 0.75) }

    /// Consecutive calendar days of exploration, counting back from the most
    /// recent day something was uncovered.
    var streakDays: Int {
        guard !points.isEmpty else { return 0 }
        let calendar = Calendar.current
        let days = Set(points.map { calendar.startOfDay(for: $0.discoveredAt) }).sorted(by: >)
        guard var cursor = days.first else { return 0 }
        var streak = 1
        for day in days.dropFirst() {
            guard let expected = calendar.date(byAdding: .day, value: -1, to: cursor), day == expected else { break }
            streak += 1
            cursor = day
        }
        return streak
    }

    // MARK: Internals

    private func isTooCloseToExistingPoint(_ coordinate: CLLocationCoordinate2D) -> Bool {
        let target = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        for cell in Cell(coordinate, size: Self.indexCellSize).neighbourhood {
            for i in index[cell] ?? [] {
                let point = points[i]
                let distance = target.distance(from: CLLocation(latitude: point.latitude, longitude: point.longitude))
                if distance < Config.breadcrumbSpacingM { return true }
            }
        }
        return false
    }

    private func noteArrival(at coordinate: CLLocationCoordinate2D) {
        guard let place = Place.nearest(to: coordinate) else { return }
        guard !visits.contains(where: { $0.id == place.id }) else { return }
        visits.append(
            Visit(id: place.id, placeName: place.name, city: place.city, country: place.country, firstSeen: Date())
        )
    }

    private func addToIndex(_ point: ExploredPoint, at offset: Int) {
        index[Cell(point.coordinate, size: Self.indexCellSize), default: []].append(offset)
    }

    private func addCoverage(for point: ExploredPoint) {
        // Mark every fine cell whose centre falls inside the revealed circle.
        let centre = CLLocation(latitude: point.latitude, longitude: point.longitude)
        let span = Int(ceil(point.radiusM / (Self.coverageCellSize * 111_320 * max(0.2, cos(point.latitude * .pi / 180))))) + 1
        let origin = Cell(point.coordinate, size: Self.coverageCellSize)

        for dx in -span...span {
            for dy in -span...span {
                let cell = Cell(x: origin.x + dx, y: origin.y + dy)
                let cellCentre = CLLocation(
                    latitude: (Double(cell.y) + 0.5) * Self.coverageCellSize,
                    longitude: (Double(cell.x) + 0.5) * Self.coverageCellSize
                )
                if centre.distance(from: cellCentre) <= point.radiusM {
                    coveredCells.insert(cell)
                }
            }
        }
    }

    private func rebuildDerivedState() {
        index = [:]
        coveredCells = []
        for (offset, point) in points.enumerated() {
            addToIndex(point, at: offset)
            addCoverage(for: point)
        }
    }

    // MARK: Persistence

    private struct Snapshot: Codable {
        var points: [ExploredPoint]
        var visits: [Visit]
        var photosLeft: Int
        var lastLatitude: Double?
        var lastLongitude: Double?
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data)
        else { return }

        points = snapshot.points
        visits = snapshot.visits
        photosLeft = snapshot.photosLeft
        if let lat = snapshot.lastLatitude, let lon = snapshot.lastLongitude {
            lastCoordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        }
        rebuildDerivedState()
    }

    private func save() {
        let snapshot = Snapshot(
            points: points,
            visits: visits,
            photosLeft: photosLeft,
            lastLatitude: lastCoordinate?.latitude,
            lastLongitude: lastCoordinate?.longitude
        )
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    private static func directory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Nimbus", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    /// ~1.1km — comfortably larger than a reveal radius, so checking a 3x3
    /// neighbourhood of cells is guaranteed to find every candidate.
    private static let indexCellSize = 0.01
    /// ~220m, the resolution the area statistic is measured at.
    private static let coverageCellSize = 0.002
}

/// An integer grid cell on a fixed degree lattice.
private struct Cell: Hashable {
    let x: Int
    let y: Int

    init(x: Int, y: Int) {
        self.x = x
        self.y = y
    }

    init(_ coordinate: CLLocationCoordinate2D, size: Double) {
        self.x = Int(floor(coordinate.longitude / size))
        self.y = Int(floor(coordinate.latitude / size))
    }

    var neighbourhood: [Cell] {
        (-1...1).flatMap { dx in (-1...1).map { dy in Cell(x: x + dx, y: y + dy) } }
    }
}
