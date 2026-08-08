import SwiftUI

/// A rectangle whose corners are a staircase of right-angle steps rather than
/// a curve — a rounded corner as pixel art would draw one. `steps` controls
/// how many stairs approximate the curve: 1 is a single sharp 45° chamfer,
/// more steps read progressively softer/rounder while staying blocky.
struct PixelRoundedRect: InsettableShape {
    var radius: CGFloat = 12
    var steps: Int = 2
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let rect = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let r = min(radius, min(rect.width, rect.height) / 2)
        let n = max(1, steps)
        let s = r / CGFloat(n)

        var path = Path()
        path.move(to: CGPoint(x: rect.minX + r, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))

        var x = rect.maxX - r
        var y = rect.minY
        for _ in 0..<n {
            x += s
            path.addLine(to: CGPoint(x: x, y: y))
            y += s
            path.addLine(to: CGPoint(x: x, y: y))
        }

        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))

        x = rect.maxX
        y = rect.maxY - r
        for _ in 0..<n {
            y += s
            path.addLine(to: CGPoint(x: x, y: y))
            x -= s
            path.addLine(to: CGPoint(x: x, y: y))
        }

        path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))

        x = rect.minX + r
        y = rect.maxY
        for _ in 0..<n {
            x -= s
            path.addLine(to: CGPoint(x: x, y: y))
            y -= s
            path.addLine(to: CGPoint(x: x, y: y))
        }

        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))

        x = rect.minX
        y = rect.minY + r
        for _ in 0..<n {
            y -= s
            path.addLine(to: CGPoint(x: x, y: y))
            x += s
            path.addLine(to: CGPoint(x: x, y: y))
        }

        path.closeSubpath()
        return path
    }

    func inset(by amount: CGFloat) -> PixelRoundedRect {
        var copy = self
        copy.insetAmount += amount
        return copy
    }
}

/// Glyphs from the bundled pixel-art icon set — hackernoon/pixel-icon-library
/// (MIT) — vendored as template-rendered PDF vectors in Assets.xcassets so
/// they tint like SF Symbols but are hand-drawn pixel art, not a filter.
enum PixelGlyph: String {
    case home = "IconHome"
    case map = "IconGrid"
    case camera = "IconCamera"
    case chartBar = "IconAnalytics"
    case gear = "IconCog"
    case users = "IconUsers"
    case person = "IconUser"
    case locationPin = "IconLocationPin"
    case flame = "IconFire"
    case steps = "IconTrending"
    case seedling = "IconSeedlings"
    case checkmark = "IconCheck"
    case checkmarkCircle = "IconCheckCircle"
    case chevronDown = "IconAngleDown"
    case chevronRight = "IconAngleRight"
    case clock = "IconClock"
    case cloud = "IconCloudFog"
    case expand = "IconExpand"
    case image = "IconImage"
    case planeDeparture = "IconPlaneDeparture"
    case sparkles = "IconSparkles"
    case wifi = "IconWifi"
}

/// A pixel-art icon from `PixelGlyph`, tinted like an SF Symbol.
struct PixelIcon: View {
    let glyph: PixelGlyph
    var size: CGFloat = 22
    var color: Color

    var body: some View {
        Image(glyph.rawValue)
            .renderingMode(.template)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .foregroundStyle(color)
            .frame(width: size, height: size)
    }
}
