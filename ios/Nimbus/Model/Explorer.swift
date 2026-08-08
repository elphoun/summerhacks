import Foundation
import SwiftUI

/// You.
///
/// One identity per device, made on first launch and kept in `UserDefaults`
/// from then on. The id is what the server files your photographs under, so it
/// has to outlive a relaunch — but not a delete-and-reinstall, which is the
/// closest thing this prototype has to signing out.
struct Explorer: Identifiable, Codable, Hashable {
    let id: String
    var displayName: String
    var colorHex: String
    /// Six characters other people type to add you. Allocated by the server on
    /// registration, so it is absent until the first successful `POST /users`.
    var friendCode: String?

    var color: Color { Color(hex: colorHex) }

    var initials: String { Self.initials(of: displayName) }

    static func initials(of name: String) -> String {
        let letters = name.split(separator: " ").prefix(2).compactMap(\.first)
        return letters.isEmpty ? "?" : letters.map(String.init).joined()
    }
}

/// Loads the one identity this device has, making it the first time round.
enum LocalIdentity {

    private static let key = "nimbus.identity"

    /// Colours a new install picks from, so two phones side by side at a demo
    /// are not both the same blue.
    private static let palette = ["#6EA8FF", "#FF9F68", "#9CE37D", "#C79BFF", "#5ED2E0", "#FFD166"]

    static func loadOrCreate(from defaults: UserDefaults = .standard) -> Explorer {
        if let data = defaults.data(forKey: key),
           let saved = try? JSONDecoder().decode(Explorer.self, from: data) {
            return saved
        }

        let fresh = Explorer(
            id: "explorer-\(UUID().uuidString.lowercased())",
            displayName: "Explorer",
            colorHex: palette.randomElement() ?? "#6EA8FF",
            friendCode: nil
        )
        save(fresh, to: defaults)
        return fresh
    }

    static func save(_ explorer: Explorer, to defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(explorer) else { return }
        defaults.set(data, forKey: key)
    }
}

/// Somebody else — a friend, or the author of a photograph.
///
/// The same shape the server returns from `/users`, `/friends` and the friend
/// lookup, so one type covers all three.
struct RemoteUser: Identifiable, Codable, Hashable {
    let id: String
    let displayName: String
    let color: String
    var isSeed: Bool?
    var friendCode: String?

    var swiftUIColor: Color { Color(hex: color) }
    var initials: String { Explorer.initials(of: displayName) }
}

struct RegistrationResponse: Codable {
    let user: RemoteUser
    let friends: [RemoteUser]
}

struct FriendListResponse: Codable {
    let friends: [RemoteUser]
}

struct AddFriendResponse: Codable {
    let friend: RemoteUser
    let friends: [RemoteUser]
}

extension Color {
    init(hex: String) {
        var value: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&value)
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: 1
        )
    }
}
