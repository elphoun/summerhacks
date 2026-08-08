import CoreLocation
import SwiftUI

/// One memory, full size.
struct PhotoDetailView: View {

    let photo: Photo
    /// Where the viewer is, so the distance can be shown for photos that did
    /// not come from a radius search (map taps, for instance).
    let from: CLLocation?

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    PhotoThumbnail(photo: photo, cornerRadius: 20)
                        .frame(height: 460)

                    if !photo.caption.isEmpty {
                        Text(photo.caption)
                            .font(.system(size: 17, weight: .medium))
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: 12) {
                        Circle()
                            .fill(Color(hex: photo.color))
                            .frame(width: 34, height: 34)
                            .overlay(Circle().stroke(.white.opacity(0.3), lineWidth: 1.5))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(photo.displayName)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white)
                            Text(photo.takenDate.formatted(date: .long, time: .shortened))
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.secondaryText)
                        }
                        Spacer()
                    }

                    VStack(spacing: 0) {
                        if let place = photo.placeName {
                            detailRow("Place", place)
                            Divider().overlay(Theme.hairline)
                        }
                        if let distance = distanceLabel {
                            detailRow("Distance from you", distance)
                            Divider().overlay(Theme.hairline)
                        }
                        detailRow("Coordinates", String(format: "%.5f, %.5f", photo.lat, photo.lon))
                    }
                    .glassPanel(cornerRadius: 16, padding: 4)
                }
                .padding(20)
            }
            .background(Theme.background)
            .navigationTitle(photo.placeName ?? "A memory")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationBackground(Theme.background)
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(Theme.secondaryText)
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    private var distanceLabel: String? {
        if let distanceM = photo.distanceM { return "\(distanceM) m" }
        guard let from else { return nil }
        let metres = from.distance(from: CLLocation(latitude: photo.lat, longitude: photo.lon))
        return metres.metresLabel
    }
}
