// Tests for the exploration model — the private half of Nimbus.
//
// These run on macOS via ../logic-tests.sh, with no simulator involved, because
// the property they check is the one the whole product rests on: a map belongs
// to one identity, and nothing another person does can uncover ground on it.
// Friendship shares photographs; it never shares movement.

import CoreLocation
import Foundation

@MainActor
enum LogicTests {

    static var failures = 0

    static func main() {
        let scratch = FileManager.default.temporaryDirectory
            .appendingPathComponent("nimbus-logic-tests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: scratch) }

        let paris = CLLocationCoordinate2D(latitude: 48.8584, longitude: 2.2945)

        test("a fresh explorer has uncovered nothing") {
            let store = ExplorationStore(explorerID: "fresh", directory: scratch)
            expect(!store.hasExploredAnywhere, "expected an empty map")
            expect(!store.isExplored(paris), "expected Paris to be clouded")
            expect(store.placesDiscovered == 0, "expected no visits")
        }

        test("standing somewhere uncovers it, and only nearby ground") {
            let store = ExplorationStore(explorerID: "alex", directory: scratch)
            store.record(CLLocation(latitude: paris.latitude, longitude: paris.longitude))

            expect(store.isExplored(paris), "expected Paris uncovered")
            expect(store.isExplored(offset(paris, metres: 120)), "expected 120m away uncovered (radius is 150m)")
            expect(!store.isExplored(offset(paris, metres: 400)), "expected 400m away still clouded")
            expect(!store.isExplored(offset(paris, metres: 50_000)), "expected the next town still clouded")
        }

        // The product's central claim: your friends' travels are not yours.
        test("a map is keyed to one identity and no other can uncover it") {
            let mine = ExplorationStore(explorerID: "me-2", directory: scratch)
            let theirs = ExplorationStore(explorerID: "friend-2", directory: scratch)

            mine.record(CLLocation(latitude: paris.latitude, longitude: paris.longitude))

            expect(mine.isExplored(paris), "I should have uncovered Paris")
            expect(!theirs.isExplored(paris), "a friend must NOT see Paris uncovered")
            expect(!theirs.hasExploredAnywhere, "their map must still be empty")

            // And it holds after both are reloaded from disk.
            let theirsAgain = ExplorationStore(explorerID: "friend-2", directory: scratch)
            expect(!theirsAgain.isExplored(paris), "still not uncovered for them after a reload")
        }

        test("fixes closer together than the spacing do not pile up breadcrumbs") {
            let store = ExplorationStore(explorerID: "dedupe", directory: scratch)
            for _ in 0..<10 {
                store.record(CLLocation(
                    coordinate: offset(paris, metres: Double.random(in: 0...25)),
                    altitude: 0, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date()
                ))
            }
            expect(store.points.count == 1, "expected 1 breadcrumb, got \(store.points.count)")
        }

        test("walking a route leaves a trail of breadcrumbs") {
            let store = ExplorationStore(explorerID: "walk", directory: scratch)
            for step in 0..<10 {
                store.record(CLLocation(
                    coordinate: offset(paris, metres: Double(step) * 100, bearing: 90),
                    altitude: 0, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date()
                ))
            }
            expect(store.points.count >= 8, "expected a trail, got \(store.points.count) points")
            expect(store.isExplored(offset(paris, metres: 900, bearing: 90)), "expected the far end uncovered")
        }

        test("arriving at a landmark records one visit, not one per step") {
            let store = ExplorationStore(explorerID: "visits", directory: scratch)
            for step in 0..<6 {
                store.record(CLLocation(
                    coordinate: offset(paris, metres: Double(step) * 70, bearing: 20),
                    altitude: 0, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date()
                ))
            }
            expect(store.placesDiscovered == 1, "expected 1 visit, got \(store.placesDiscovered)")
            expect(store.visits.first?.placeName == "Eiffel Tower", "expected the Eiffel Tower, got \(store.visits.first?.placeName ?? "nothing")")
        }

        test("exploration survives a relaunch") {
            let first = ExplorationStore(explorerID: "persist", directory: scratch)
            first.record(CLLocation(latitude: paris.latitude, longitude: paris.longitude))
            first.notePhotoLeft()

            let second = ExplorationStore(explorerID: "persist", directory: scratch)
            expect(second.isExplored(paris), "expected Paris still uncovered after reload")
            expect(second.photosLeft == 1, "expected the photo count to persist")
            expect(second.placesDiscovered == 1, "expected visits to persist")
        }

        test("resetting clouds one map over without touching any other") {
            let a = ExplorationStore(explorerID: "reset-a", directory: scratch)
            let b = ExplorationStore(explorerID: "reset-b", directory: scratch)
            a.record(CLLocation(latitude: paris.latitude, longitude: paris.longitude))
            b.record(CLLocation(latitude: paris.latitude, longitude: paris.longitude))

            a.reset()
            expect(!a.isExplored(paris), "expected A to be clouded over")
            expect(b.isExplored(paris), "expected B to be untouched")
        }

        test("uncovered area is reported in a sane range") {
            let store = ExplorationStore(explorerID: "area", directory: scratch)
            expect(store.uncoveredAreaKm2 == 0, "expected zero area to start")

            store.record(CLLocation(latitude: paris.latitude, longitude: paris.longitude))
            // A 150m circle is ~0.07 km²; the grid measures it in ~220m cells,
            // so anything in this window is the right order of magnitude.
            let area = store.uncoveredAreaKm2
            expect(area > 0.01 && area < 0.5, "expected a small but non-zero area, got \(area)")
        }

        test("landmark lookup only claims a place you are actually at") {
            expect(Place.nearest(to: paris)?.name == "Eiffel Tower", "expected the Eiffel Tower")
            expect(Place.nearest(to: offset(paris, metres: 5_000)) == nil, "expected nowhere 5km out")
            expect(Place.nearest(to: CLLocationCoordinate2D(latitude: -40, longitude: -130)) == nil, "expected nowhere in the Pacific")
        }

        print(failures == 0 ? "\nall logic tests passed" : "\n\(failures) failing assertion(s)")
        exit(failures == 0 ? 0 : 1)
    }

    // MARK: Harness

    static func test(_ name: String, _ body: () -> Void) {
        let before = failures
        body()
        print("\(failures == before ? "✔" : "✘") \(name)")
    }

    static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
        if !condition {
            failures += 1
            print("    ✘ \(message())")
        }
    }

    static func offset(_ coordinate: CLLocationCoordinate2D,
                       metres: Double,
                       bearing: Double = 45) -> CLLocationCoordinate2D {
        let earthRadius = 6_371_008.8
        let b = bearing * .pi / 180
        let angular = metres / earthRadius
        let lat1 = coordinate.latitude * .pi / 180
        let lon1 = coordinate.longitude * .pi / 180
        let lat2 = asin(sin(lat1) * cos(angular) + cos(lat1) * sin(angular) * cos(b))
        let lon2 = lon1 + atan2(sin(b) * sin(angular) * cos(lat1), cos(angular) - sin(lat1) * sin(lat2))
        return CLLocationCoordinate2D(latitude: lat2 * 180 / .pi, longitude: lon2 * 180 / .pi)
    }
}

// Top-level code runs on the main thread but is not main-actor isolated.
MainActor.assumeIsolated { LogicTests.main() }
