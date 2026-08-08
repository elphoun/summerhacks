import MapKit
import UIKit

/// Cloud cover over the entire planet. What you have explored is punched out
/// of it.
final class FogOverlay: NSObject, MKOverlay {
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: 0, longitude: 0) }
    var boundingMapRect: MKMapRect { .world }
}

/// Draws the cloud layer and erases the parts of it you have earned.
///
/// The erase is a `destinationOut` radial gradient rather than a plain circle,
/// so reveals have soft edges — cloud burning off, not a cookie cutter. MapKit
/// hands us one tile at a time on background threads, and each tile gets its
/// own context, so filling then erasing within a tile composites correctly.
final class FogRenderer: MKOverlayRenderer {

    /// Breadcrumbs to erase. Written from the main actor, read on MapKit's
    /// drawing threads, hence the lock.
    var points: [ExploredPoint] {
        get { lock.withLock { storedPoints } }
        set { lock.withLock { storedPoints = newValue } }
    }

    private var storedPoints: [ExploredPoint] = []
    private let lock = NSLock()

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        let tile = rect(for: mapRect)

        context.setFillColor(Self.fogColor)
        context.fill(tile)
        drawCloudTexture(mapRect: mapRect, zoomScale: zoomScale, in: context)

        guard let gradient = Self.revealGradient else { return }
        let snapshot = points

        // Zoomed right out, 150m is far below a pixel. Floor the erase radius
        // so a life of travel still reads as a constellation of lit points.
        let minimumRadius = Double(Config.minimumRevealScreenPoints) / Double(zoomScale)

        context.saveGState()
        context.setBlendMode(.destinationOut)

        for point in snapshot {
            let mapPoint = MKMapPoint(point.coordinate)
            let radius = max(point.radiusM * MKMapPointsPerMeterAtLatitude(point.latitude), minimumRadius)

            let bounds = MKMapRect(
                x: mapPoint.x - radius,
                y: mapPoint.y - radius,
                width: radius * 2,
                height: radius * 2
            )
            guard bounds.intersects(mapRect) else { continue }

            let centre = self.point(for: mapPoint)
            context.drawRadialGradient(
                gradient,
                startCenter: centre,
                startRadius: radius * 0.55,
                endCenter: centre,
                endRadius: radius,
                options: [.drawsBeforeStartLocation]
            )
        }

        context.restoreGState()
    }

    /// Soft highlights on a lattice fixed in *map* space rather than tile
    /// space, so neighbouring tiles agree and no seams appear.
    private func drawCloudTexture(mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        guard let puff = Self.cloudGradient else { return }

        let spacing = 170.0 / Double(zoomScale)
        let radius = spacing * 0.8

        let firstX = Int(floor((mapRect.minX - radius) / spacing))
        let lastX = Int(ceil((mapRect.maxX + radius) / spacing))
        let firstY = Int(floor((mapRect.minY - radius) / spacing))
        let lastY = Int(ceil((mapRect.maxY + radius) / spacing))

        // A wildly zoomed-out tile could ask for an unbounded number of puffs.
        guard (lastX - firstX) * (lastY - firstY) < 4_000 else { return }

        for ix in firstX...lastX {
            for iy in firstY...lastY {
                let noise = Self.hash(ix, iy)
                let jitterX = Double((noise & 0xFF)) / 255 - 0.5
                let jitterY = Double((noise >> 8) & 0xFF) / 255 - 0.5
                let scale = 0.6 + Double((noise >> 16) & 0xFF) / 255 * 0.7

                let centre = point(for: MKMapPoint(
                    x: (Double(ix) + 0.5 + jitterX * 0.7) * spacing,
                    y: (Double(iy) + 0.5 + jitterY * 0.7) * spacing
                ))
                context.drawRadialGradient(
                    puff,
                    startCenter: centre,
                    startRadius: 0,
                    endCenter: centre,
                    endRadius: CGFloat(radius * scale),
                    options: []
                )
            }
        }
    }

    private static func hash(_ x: Int, _ y: Int) -> UInt32 {
        var h = UInt32(truncatingIfNeeded: x &* 374_761_393 &+ y &* 668_265_263)
        h = (h ^ (h >> 13)) &* 1_274_126_177
        return h ^ (h >> 16)
    }

    // MARK: Appearance

    private static let fogColor = UIColor(red: 0.055, green: 0.075, blue: 0.135, alpha: 0.985).cgColor

    private static let revealGradient: CGGradient? = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [
            UIColor(white: 1, alpha: 1).cgColor,
            UIColor(white: 1, alpha: 0).cgColor,
        ] as CFArray,
        locations: [0, 1]
    )

    private static let cloudGradient: CGGradient? = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [
            UIColor(red: 0.62, green: 0.70, blue: 0.92, alpha: 0.09).cgColor,
            UIColor(red: 0.62, green: 0.70, blue: 0.92, alpha: 0).cgColor,
        ] as CFArray,
        locations: [0, 1]
    )
}

private extension NSLock {
    func withLock<T>(_ body: () -> T) -> T {
        lock()
        defer { unlock() }
        return body()
    }
}
