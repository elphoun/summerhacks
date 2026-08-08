import SwiftUI

/// Manrope, the typeface for every non-map screen. Bundled as static weights
/// (see Info.plist's UIAppFonts) rather than the variable font, so SwiftUI's
/// name-based `Font.custom` resolves a specific weight reliably.
extension Font {
    static func wander(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        let name: String
        switch weight {
        case .heavy, .black: name = "Manrope-ExtraBold"
        case .bold: name = "Manrope-Bold"
        case .semibold: name = "Manrope-SemiBold"
        case .medium: name = "Manrope-Medium"
        default: name = "Manrope-Regular"
        }
        return .custom(name, size: size)
    }
}

/// The light, illustrated palette used by every screen except the map itself —
/// home, friends, stats, and the sheets they open. The map screen keeps
/// `Theme` (dark glass) untouched, so this lives alongside it rather than
/// replacing it.
enum WanderTheme {
    static let background = Color(red: 0.965, green: 0.914, blue: 0.812)
    static let panel = Color(red: 0.996, green: 0.973, blue: 0.925)
    static let panelSoft = Color(red: 0.984, green: 0.941, blue: 0.855)
    static let accent = Color(red: 0.357, green: 0.541, blue: 0.227)
    static let warm = Color(red: 0.851, green: 0.498, blue: 0.208)
    static let textPrimary = Color(red: 0.290, green: 0.184, blue: 0.094)
    static let secondaryText = Color(red: 0.557, green: 0.427, blue: 0.286)
    static let hairline = Color(red: 0.290, green: 0.184, blue: 0.094).opacity(0.14)
    static let shadow = Color(red: 0.290, green: 0.184, blue: 0.094).opacity(0.14)
}

/// Frosted-in-daylight panel used by every card on the non-map screens.
struct WanderCard: ViewModifier {
    var cornerRadius: CGFloat = 20
    var padding: CGFloat = 14
    var fill: Color = WanderTheme.panel

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(fill, in: PixelRoundedRect(radius: cornerRadius, steps: 2))
            .overlay(
                PixelRoundedRect(radius: cornerRadius, steps: 2)
                    .stroke(WanderTheme.hairline, lineWidth: 1.5)
            )
            .shadow(color: WanderTheme.shadow, radius: 10, y: 5)
    }
}

extension View {
    func wanderCard(cornerRadius: CGFloat = 20, padding: CGFloat = 14, fill: Color = WanderTheme.panel) -> some View {
        modifier(WanderCard(cornerRadius: cornerRadius, padding: padding, fill: fill))
    }
}

/// The five destinations behind the bottom bar. Camera has no screen of its
/// own — it always opens the capture sheet — so it is not a case here.
enum WanderTab: Hashable {
    case home, map, friends, stats
}

/// The illustrated bottom bar from the mock: four destinations plus a raised
/// shutter button that always opens capture, regardless of the active tab.
struct WanderTabBar: View {
    @Binding var tab: WanderTab
    let onCapture: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.home, glyph: .home, label: "Home")
            tabButton(.map, glyph: .map, label: "Map")
            cameraButton
            tabButton(.friends, glyph: .users, label: "Friends")
            tabButton(.stats, glyph: .chartBar, label: "Stats")
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 30)
        .background(alignment: .top) {
            WanderTheme.background
                .overlay(alignment: .top) {
                    Rectangle().fill(WanderTheme.hairline).frame(height: 1)
                }
        }
    }

    private func tabButton(_ value: WanderTab, glyph: PixelGlyph, label: String) -> some View {
        let isActive = tab == value
        return Button {
            tab = value
        } label: {
            VStack(spacing: 4) {
                PixelIcon(glyph: glyph, size: 21, color: isActive ? WanderTheme.accent : WanderTheme.secondaryText)
                Text(label)
                    .font(.wander(11, weight: .semibold))
                    .foregroundStyle(isActive ? WanderTheme.accent : WanderTheme.secondaryText)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var cameraButton: some View {
        Button(action: onCapture) {
            PixelIcon(glyph: .camera, size: 24, color: WanderTheme.textPrimary)
                .frame(width: 60, height: 60)
                .background(Circle().fill(WanderTheme.panel))
                .overlay(Circle().stroke(WanderTheme.textPrimary.opacity(0.55), lineWidth: 2.5))
                .shadow(color: WanderTheme.shadow, radius: 8, y: 4)
                .offset(y: -12)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
    }
}
