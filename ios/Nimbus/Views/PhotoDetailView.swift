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
                            .font(.wander(17, weight: .medium))
                            .foregroundStyle(WanderTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: 12) {
                        Circle()
                            .fill(Color(hex: photo.color))
                            .frame(width: 34, height: 34)
                            .overlay(Circle().stroke(WanderTheme.textPrimary.opacity(0.25), lineWidth: 1.5))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(photo.displayName)
                                .font(.wander(15, weight: .semibold))
                                .foregroundStyle(WanderTheme.textPrimary)
                            Text(photo.takenDate.formatted(date: .long, time: .shortened))
                                .font(.wander(12))
                                .foregroundStyle(WanderTheme.secondaryText)
                        }
                        Spacer()
                    }

                    VStack(spacing: 0) {
                        if let place = photo.placeName {
                            detailRow("Place", place)
                            Divider().overlay(WanderTheme.hairline)
                        }
                        if let distance = distanceLabel {
                            detailRow("Distance from you", distance)
                            Divider().overlay(WanderTheme.hairline)
                        }
                        detailRow("Coordinates", String(format: "%.5f, %.5f", photo.lat, photo.lon))
                    }
                    .wanderCard(cornerRadius: 16, padding: 4)
                }
                .padding(20)
            }
            .background(WanderTheme.background)
            .navigationTitle(photo.placeName ?? "A memory")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationBackground(WanderTheme.background)
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.wander(13))
                .foregroundStyle(WanderTheme.secondaryText)
            Spacer()
            Text(value)
                .font(.wander(13, weight: .medium))
                .foregroundStyle(WanderTheme.textPrimary)
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
