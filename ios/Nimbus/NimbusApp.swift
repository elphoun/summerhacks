import SwiftUI

/// Nimbus — a personal exploration map, and the photographs people leave behind
/// in the places it uncovers.
///
/// Two halves, deliberately kept apart:
///   • what you have explored is private, stored on this device only
///   • what you photograph is shared, stored in the server under ../server
@main
struct NimbusApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
