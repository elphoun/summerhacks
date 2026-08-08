import CoreGraphics
import UIKit

/// Makes a plausible photograph on demand.
///
/// The iOS Simulator has no camera, and a demo that cannot take a photo cannot
/// show the half of the app that matters. This draws a stylised scene instead —
/// the same idea as the server's seed artwork, so a simulated capture sits
/// naturally alongside the seeded memories in a gallery.
enum SampleShotRenderer {

    static func make(seed: UInt64 = UInt64.random(in: 0..<UInt64.max)) -> UIImage {
        var rng = SeededGenerator(seed: seed)
        let size = CGSize(width: 900, height: 1200)

        return UIGraphicsImageRenderer(size: size).image { context in
            let ctx = context.cgContext
            let palette = Palette.all.randomElement(using: &rng)!
            let horizon = size.height * CGFloat(Double.random(in: 0.6...0.72, using: &rng))

            // Sky
            drawVerticalGradient(
                in: ctx,
                rect: CGRect(x: 0, y: 0, width: size.width, height: horizon),
                from: palette.skyTop,
                to: palette.skyHorizon
            )

            // Sun or moon, with a glow.
            let lightX = size.width * CGFloat(Double.random(in: 0.2...0.8, using: &rng))
            let lightY = horizon * CGFloat(Double.random(in: 0.2...0.55, using: &rng))
            drawRadialGlow(in: ctx, centre: CGPoint(x: lightX, y: lightY), radius: 260, color: palette.glow)
            ctx.setFillColor(palette.light.cgColor)
            ctx.fillEllipse(in: CGRect(x: lightX - 42, y: lightY - 42, width: 84, height: 84))

            // Two silhouette ridges, the far one hazier.
            drawRidge(
                in: ctx,
                width: size.width,
                baseline: horizon,
                height: 190,
                colour: palette.haze,
                roughness: 0.55,
                rng: &rng
            )
            drawRidge(
                in: ctx,
                width: size.width,
                baseline: horizon + 14,
                height: 300,
                colour: palette.silhouette,
                roughness: 1.0,
                rng: &rng
            )

            // Ground
            drawVerticalGradient(
                in: ctx,
                rect: CGRect(x: 0, y: horizon, width: size.width, height: size.height - horizon),
                from: palette.silhouette,
                to: palette.ground
            )

            drawVignette(in: ctx, size: size)
        }
    }

    /// JPEG bytes ready to upload.
    static func makeData(seed: UInt64 = UInt64.random(in: 0..<UInt64.max)) -> Data {
        make(seed: seed).jpegData(compressionQuality: 0.85) ?? Data()
    }

    // MARK: Pieces

    private static func drawVerticalGradient(in ctx: CGContext, rect: CGRect, from: UIColor, to: UIColor) {
        guard let gradient = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [from.cgColor, to.cgColor] as CFArray,
            locations: [0, 1]
        ) else { return }

        ctx.saveGState()
        ctx.clip(to: rect)
        ctx.drawLinearGradient(
            gradient,
            start: CGPoint(x: 0, y: rect.minY),
            end: CGPoint(x: 0, y: rect.maxY),
            options: []
        )
        ctx.restoreGState()
    }

    private static func drawRadialGlow(in ctx: CGContext, centre: CGPoint, radius: CGFloat, color: UIColor) {
        guard let gradient = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [color.withAlphaComponent(0.55).cgColor, color.withAlphaComponent(0).cgColor] as CFArray,
            locations: [0, 1]
        ) else { return }
        ctx.drawRadialGradient(gradient, startCenter: centre, startRadius: 0, endCenter: centre, endRadius: radius, options: [])
    }

    private static func drawRidge(in ctx: CGContext,
                                  width: CGFloat,
                                  baseline: CGFloat,
                                  height: CGFloat,
                                  colour: UIColor,
                                  roughness: Double,
                                  rng: inout SeededGenerator) {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 0, y: baseline + height))

        var x: CGFloat = 0
        let step = width / 9
        while x <= width {
            let bump = CGFloat(Double.random(in: 0...1, using: &rng)) * height * CGFloat(roughness)
            path.addLine(to: CGPoint(x: x, y: baseline - bump * 0.55))
            x += step
        }
        path.addLine(to: CGPoint(x: width, y: baseline + height))
        path.closeSubpath()

        ctx.setFillColor(colour.cgColor)
        ctx.addPath(path)
        ctx.fillPath()
    }

    private static func drawVignette(in ctx: CGContext, size: CGSize) {
        guard let gradient = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [UIColor.black.withAlphaComponent(0).cgColor, UIColor.black.withAlphaComponent(0.45).cgColor] as CFArray,
            locations: [0.55, 1]
        ) else { return }

        let centre = CGPoint(x: size.width / 2, y: size.height / 2)
        ctx.drawRadialGradient(
            gradient,
            startCenter: centre,
            startRadius: 0,
            endCenter: centre,
            endRadius: max(size.width, size.height) * 0.75,
            options: []
        )
    }

    private struct Palette {
        let skyTop: UIColor
        let skyHorizon: UIColor
        let light: UIColor
        let glow: UIColor
        let haze: UIColor
        let silhouette: UIColor
        let ground: UIColor

        static let all: [Palette] = [
            Palette(
                skyTop: UIColor(red: 0.03, green: 0.04, blue: 0.11, alpha: 1),
                skyHorizon: UIColor(red: 0.15, green: 0.13, blue: 0.28, alpha: 1),
                light: UIColor(red: 0.93, green: 0.94, blue: 1.0, alpha: 1),
                glow: UIColor(red: 0.47, green: 0.55, blue: 0.86, alpha: 1),
                haze: UIColor(red: 0.13, green: 0.13, blue: 0.24, alpha: 1),
                silhouette: UIColor(red: 0.05, green: 0.05, blue: 0.11, alpha: 1),
                ground: UIColor(red: 0.02, green: 0.02, blue: 0.05, alpha: 1)
            ),
            Palette(
                skyTop: UIColor(red: 0.33, green: 0.55, blue: 0.78, alpha: 1),
                skyHorizon: UIColor(red: 1.0, green: 0.77, blue: 0.48, alpha: 1),
                light: UIColor(red: 1.0, green: 0.95, blue: 0.79, alpha: 1),
                glow: UIColor(red: 1.0, green: 0.74, blue: 0.43, alpha: 1),
                haze: UIColor(red: 0.6, green: 0.47, blue: 0.42, alpha: 1),
                silhouette: UIColor(red: 0.18, green: 0.13, blue: 0.15, alpha: 1),
                ground: UIColor(red: 0.08, green: 0.06, blue: 0.08, alpha: 1)
            ),
            Palette(
                skyTop: UIColor(red: 0.1, green: 0.12, blue: 0.32, alpha: 1),
                skyHorizon: UIColor(red: 0.93, green: 0.46, blue: 0.42, alpha: 1),
                light: UIColor(red: 1.0, green: 0.77, blue: 0.63, alpha: 1),
                glow: UIColor(red: 0.96, green: 0.47, blue: 0.43, alpha: 1),
                haze: UIColor(red: 0.49, green: 0.36, blue: 0.44, alpha: 1),
                silhouette: UIColor(red: 0.11, green: 0.08, blue: 0.16, alpha: 1),
                ground: UIColor(red: 0.05, green: 0.04, blue: 0.08, alpha: 1)
            ),
        ]
    }
}

/// Deterministic RNG so a given seed always draws the same scene.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        self.state = seed == 0 ? 0x9E3779B97F4A7C15 : seed
    }

    mutating func next() -> UInt64 {
        state ^= state << 13
        state ^= state >> 7
        state ^= state << 17
        return state
    }
}
