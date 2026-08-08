import Foundation
import SwiftUI

/// A person using the app.
///
/// The prototype ships a small roster so that "these two people have different
/// maps" can be demonstrated on one device. Identifiers are stable, so photos
/// uploaded in an earlier run still belong to the same explorer after a
/// reinstall.
struct Explorer: Identifiable, Codable, Hashable {
    let id: String
    let displayName: String
    let colorHex: String
    /// Where this explorer's simulated life starts. Their map begins fogged
    /// everywhere except here.
    let homePlaceID: String

    var color: Color { Color(hex: colorHex) }

    var initials: String {
        displayName.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined()
    }

    var home: Place {
        Place.all.first { $0.id == homePlaceID } ?? Place.all[0]
    }
}

extension Explorer {
    static let roster: [Explorer] = [
        Explorer(id: "explorer-alex", displayName: "Alex Rivera", colorHex: "#6EA8FF", homePlaceID: "golden-gate"),
        Explorer(id: "explorer-sam", displayName: "Sam Chen", colorHex: "#FF9F68", homePlaceID: "shibuya"),
        Explorer(id: "explorer-robin", displayName: "Robin Ellis", colorHex: "#9CE37D", homePlaceID: "times-square"),
    ]

    static var `default`: Explorer { roster[0] }
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
