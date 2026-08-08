import MapKit
import SwiftUI

/// A camera instruction. Compared by token so repeated identical requests (for
/// example "centre on me" twice) still take effect.
struct MapFocus: Equatable {
    let token: Int
    let latitude: Double
    let longitude: Double
    let metres: Double
    let animated: Bool

    static func == (lhs: MapFocus, rhs: MapFocus) -> Bool { lhs.token == rhs.token }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

/// The map itself.
///
/// `MKMapView` rather than SwiftUI's `Map`, because the fog needs a custom
/// `MKOverlayRenderer` and SwiftUI has no way to supply one.
struct ExplorationMapView: UIViewRepresentable {

    let points: [ExploredPoint]
    /// Bumped whenever the breadcrumb set changes, so the fog redraws.
    let fogVersion: Int
    /// Already filtered to areas this explorer has uncovered.
    let photos: [Photo]
    let userLocation: CLLocation?
    let userColor: UIColor
    let focus: MapFocus?
    let followsUser: Bool

    var onLongPress: (CLLocationCoordinate2D) -> Void
    var onSelect: (Photo) -> Void
    var onRegionChange: (MKCoordinateRegion) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.mapType = .mutedStandard
        mapView.overrideUserInterfaceStyle = .dark
        mapView.showsCompass = false
        mapView.showsScale = false
        mapView.isRotateEnabled = false
        mapView.isPitchEnabled = false
        mapView.showsUserLocation = false // location is simulated; we draw our own

        mapView.register(PhotoAnnotationView.self, forAnnotationViewWithReuseIdentifier: PhotoAnnotationView.reuseID)
        mapView.register(ExplorerAnnotationView.self, forAnnotationViewWithReuseIdentifier: ExplorerAnnotationView.reuseID)
        mapView.register(
            MKMarkerAnnotationView.self,
            forAnnotationViewWithReuseIdentifier: MKMapViewDefaultClusterAnnotationViewReuseIdentifier
        )

        mapView.addOverlay(context.coordinator.fog, level: .aboveLabels)

        let longPress = UILongPressGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleLongPress(_:))
        )
        longPress.minimumPressDuration = 0.35
        mapView.addGestureRecognizer(longPress)
        context.coordinator.mapView = mapView

        // Open on the whole clouded planet; the model focuses us shortly after.
        mapView.setRegion(
            MKCoordinateRegion(
                center: userLocation?.coordinate ?? CLLocationCoordinate2D(latitude: 20, longitude: 0),
                span: MKCoordinateSpan(latitudeDelta: 120, longitudeDelta: 120)
            ),
            animated: false
        )
        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self

        if coordinator.fogVersion != fogVersion {
            coordinator.fogVersion = fogVersion
            coordinator.renderer?.points = points
            coordinator.renderer?.setNeedsDisplay()
        }

        coordinator.syncPhotoAnnotations(photos, on: mapView)
        coordinator.syncExplorer(userLocation, on: mapView)

        if let focus, coordinator.lastFocusToken != focus.token {
            coordinator.lastFocusToken = focus.token
            mapView.setRegion(
                MKCoordinateRegion(
                    center: focus.coordinate,
                    latitudinalMeters: focus.metres,
                    longitudinalMeters: focus.metres
                ),
                animated: focus.animated
            )
        } else if followsUser, let coordinate = userLocation?.coordinate {
            // Only recentre on real movement. Re-setting the same centre would
            // fire another regionDidChange and loop us back here every frame.
            let centre = mapView.centerCoordinate
            let drift = CLLocation(latitude: centre.latitude, longitude: centre.longitude)
                .distance(from: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
            if drift > 15 {
                mapView.setCenter(coordinate, animated: false)
            }
        }
    }

    // MARK: Coordinator

    final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: ExplorationMapView
        weak var mapView: MKMapView?

        let fog = FogOverlay()
        private(set) weak var renderer: FogRenderer?

        var fogVersion = -1
        var lastFocusToken = -1

        private var photoAnnotations: [String: PhotoAnnotation] = [:]
        private var explorerAnnotation: ExplorerAnnotation?

        init(_ parent: ExplorationMapView) {
            self.parent = parent
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard overlay is FogOverlay else { return MKOverlayRenderer(overlay: overlay) }
            let renderer = FogRenderer(overlay: overlay)
            renderer.points = parent.points
            self.renderer = renderer
            fogVersion = parent.fogVersion
            return renderer
        }

        func syncPhotoAnnotations(_ photos: [Photo], on mapView: MKMapView) {
            let wanted = Set(photos.map(\.id))

            for (id, annotation) in photoAnnotations where !wanted.contains(id) {
                mapView.removeAnnotation(annotation)
                photoAnnotations[id] = nil
            }
            for photo in photos where photoAnnotations[photo.id] == nil {
                let annotation = PhotoAnnotation(photo: photo)
                photoAnnotations[photo.id] = annotation
                mapView.addAnnotation(annotation)
            }
        }

        func syncExplorer(_ location: CLLocation?, on mapView: MKMapView) {
            guard let coordinate = location?.coordinate else { return }
            if let existing = explorerAnnotation {
                existing.coordinate = coordinate
            } else {
                let annotation = ExplorerAnnotation(coordinate: coordinate)
                explorerAnnotation = annotation
                mapView.addAnnotation(annotation)
            }
            if let view = explorerAnnotation.flatMap({ mapView.view(for: $0) }) as? ExplorerAnnotationView {
                view.tint = parent.userColor
            }
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            if annotation is ExplorerAnnotation {
                let view = mapView.dequeueReusableAnnotationView(
                    withIdentifier: ExplorerAnnotationView.reuseID,
                    for: annotation
                ) as? ExplorerAnnotationView
                view?.tint = parent.userColor
                return view
            }
            if let photo = annotation as? PhotoAnnotation {
                let view = mapView.dequeueReusableAnnotationView(
                    withIdentifier: PhotoAnnotationView.reuseID,
                    for: annotation
                ) as? PhotoAnnotationView
                view?.apply(photo.photo)
                return view
            }
            return nil
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            defer { mapView.deselectAnnotation(view.annotation, animated: false) }

            if let photo = view.annotation as? PhotoAnnotation {
                parent.onSelect(photo.photo)
            } else if let cluster = view.annotation as? MKClusterAnnotation {
                // Zoom into a cluster rather than opening an arbitrary member.
                let region = MKCoordinateRegion(
                    center: cluster.coordinate,
                    latitudinalMeters: 400,
                    longitudinalMeters: 400
                )
                mapView.setRegion(region, animated: true)
            }
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            let region = mapView.region
            // Never mutate SwiftUI state inside a view update pass.
            DispatchQueue.main.async { [parent] in
                parent.onRegionChange(region)
            }
        }

        @objc func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
            guard gesture.state == .began, let mapView else { return }
            let coordinate = mapView.convert(gesture.location(in: mapView), toCoordinateFrom: mapView)
            parent.onLongPress(coordinate)
        }
    }
}

// MARK: - Annotations

final class PhotoAnnotation: NSObject, MKAnnotation {
    let photo: Photo
    var coordinate: CLLocationCoordinate2D { photo.coordinate }
    var title: String? { photo.displayName }
    var subtitle: String? { photo.caption }

    init(photo: Photo) {
        self.photo = photo
    }
}

final class PhotoAnnotationView: MKMarkerAnnotationView {
    static let reuseID = "photo"

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        clusteringIdentifier = "photo"
        displayPriority = .defaultHigh
        glyphImage = UIImage(systemName: "camera.fill")
        titleVisibility = .hidden
        subtitleVisibility = .hidden
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not used") }

    func apply(_ photo: Photo) {
        markerTintColor = UIColor(Color(hex: photo.color))
        clusteringIdentifier = "photo"
    }
}

/// Where you are. Not `showsUserLocation`, because in this prototype "you" are
/// usually a simulated traveller.
final class ExplorerAnnotation: NSObject, MKAnnotation {
    @objc dynamic var coordinate: CLLocationCoordinate2D

    init(coordinate: CLLocationCoordinate2D) {
        self.coordinate = coordinate
    }
}

final class ExplorerAnnotationView: MKAnnotationView {
    static let reuseID = "explorer"

    var tint: UIColor = .systemBlue {
        didSet { dot.backgroundColor = tint }
    }

    private let halo = UIView()
    private let dot = UIView()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)

        frame = CGRect(x: 0, y: 0, width: 44, height: 44)
        displayPriority = .required
        collisionMode = .circle
        isEnabled = false

        halo.frame = bounds
        halo.layer.cornerRadius = 22
        halo.backgroundColor = UIColor.white.withAlphaComponent(0.16)
        addSubview(halo)

        dot.frame = CGRect(x: 15, y: 15, width: 14, height: 14)
        dot.layer.cornerRadius = 7
        dot.backgroundColor = tint
        dot.layer.borderWidth = 2.5
        dot.layer.borderColor = UIColor.white.cgColor
        dot.layer.shadowColor = UIColor.black.cgColor
        dot.layer.shadowOpacity = 0.4
        dot.layer.shadowRadius = 3
        dot.layer.shadowOffset = .zero
        addSubview(dot)

        startPulsing()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not used") }

    private func startPulsing() {
        let pulse = CABasicAnimation(keyPath: "transform.scale")
        pulse.fromValue = 0.75
        pulse.toValue = 1.25
        pulse.duration = 1.6
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        halo.layer.add(pulse, forKey: "pulse")
    }
}
