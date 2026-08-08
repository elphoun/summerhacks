import SwiftUI

enum Theme {
    static let background = Color(red: 0.035, green: 0.047, blue: 0.086)
    static let panel = Color(red: 0.09, green: 0.11, blue: 0.17)
    static let accent = Color(red: 0.43, green: 0.66, blue: 1.0)
    static let warm = Color(red: 1.0, green: 0.62, blue: 0.41)
    static let hairline = Color.white.opacity(0.12)
    static let secondaryText = Color.white.opacity(0.62)
}

/// Frosted panel used by every floating control, so the map stays the subject.
struct GlassPanel: ViewModifier {
    var cornerRadius: CGFloat = 18
    var padding: CGFloat = 12

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Theme.hairline, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.35), radius: 12, y: 6)
    }
}

extension View {
    func glassPanel(cornerRadius: CGFloat = 18, padding: CGFloat = 12) -> some View {
        modifier(GlassPanel(cornerRadius: cornerRadius, padding: padding))
    }
}

/// Round frosted button for the map controls.
struct CircleGlassButton: View {
    let systemImage: String
    var label: String?
    var tint: Color = .white
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: .semibold))
                if let label {
                    Text(label)
                        .font(.system(size: 10, weight: .medium))
                }
            }
            .foregroundStyle(tint)
            .frame(width: 62, height: label == nil ? 56 : 62)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Theme.hairline, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

/// Initials in a coloured ring. Stands in for a profile picture.
struct ExplorerAvatar: View {
    let explorer: Explorer
    var size: CGFloat = 34

    var body: some View {
        Text(explorer.initials)
            .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Circle().fill(explorer.color.opacity(0.85)))
            .overlay(Circle().stroke(.white.opacity(0.35), lineWidth: 1.5))
    }
}

/// A photo from the shared collection, with a soft placeholder while it loads.
struct PhotoThumbnail: View {
    let photo: Photo
    var cornerRadius: CGFloat = 14

    var body: some View {
        AsyncImage(url: photo.imageURL, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            case .failure:
                ZStack {
                    Theme.panel
                    Image(systemName: "photo")
                        .foregroundStyle(Theme.secondaryText)
                }
            default:
                ZStack {
                    Theme.panel
                    ProgressView().tint(Theme.secondaryText)
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(Theme.hairline, lineWidth: 1)
        )
    }
}

extension Photo {
    /// "Mira Okonkwo · 34 m away · March"
    var attribution: String {
        var parts = [displayName]
        if let distanceM { parts.append("\(distanceM) m away") }
        parts.append(takenDate.formatted(.dateTime.month(.abbreviated).year()))
        return parts.joined(separator: " · ")
    }
}

extension Double {
    /// Metres, written the way a person would say them.
    var metresLabel: String {
        self >= 1000 ? String(format: "%.1f km", self / 1000) : "\(Int(self)) m"
    }
}
