import SwiftUI

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
            .background(fill, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
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
            tabButton(.home, systemImage: "house.fill", label: "Home")
            tabButton(.map, systemImage: "map.fill", label: "Map")
            cameraButton
            tabButton(.friends, systemImage: "person.2.fill", label: "Friends")
            tabButton(.stats, systemImage: "chart.bar.fill", label: "Stats")
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

    private func tabButton(_ value: WanderTab, systemImage: String, label: String) -> some View {
        let isActive = tab == value
        return Button {
            tab = value
        } label: {
            VStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.system(size: 21, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
            }
            .foregroundStyle(isActive ? WanderTheme.accent : WanderTheme.secondaryText)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var cameraButton: some View {
        Button(action: onCapture) {
            Image(systemName: "camera.fill")
                .font(.system(size: 23, weight: .semibold))
                .foregroundStyle(WanderTheme.textPrimary)
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
