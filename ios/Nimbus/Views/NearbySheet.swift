import SwiftUI

/// The payoff: what other people left where you are standing.
///
/// The radius the server actually answered with is shown, not assumed, so when
/// the search widens from 100m to 250m the person watching understands why a
/// photo from four streets away is on screen.
struct NearbySheet: View {

    let presentation: NearbyPresentation
    let close: () -> Void
    @State private var selected: Photo?

    private var result: NearbyResult { presentation.result }
    private var others: [Photo] { result.others }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header

                    if let mine = presentation.justUploaded {
                        yoursCard(mine)
                    }

                    if others.isEmpty {
                        emptyState
                    } else {
                        Text("Left here by other people")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.secondaryText)
                            .textCase(.uppercase)
                        grid
                    }
                }
                .padding(20)
            }
            .background(Theme.background)
            .navigationTitle("This place")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { close() }
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(Theme.background)
        .sheet(item: $selected) { photo in
            PhotoDetailView(photo: photo, from: nil)
        }
    }

    // MARK: Pieces

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(headline)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                Label("within \(Int(result.radiusUsed)) m", systemImage: "scope")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())

                if result.expanded {
                    Label("widened", systemImage: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.warm)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                }
            }

            if result.expanded {
                Text("Fewer than three memories within \(Int(result.primaryRadiusM)) m, so Nimbus widened the search to \(Int(result.fallbackRadiusM)) m.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var headline: String {
        switch others.count {
        case 0: "You are the first one here."
        case 1: "One other person has stood here."
        default: "\(others.count) other people have stood here."
        }
    }

    private func yoursCard(_ photo: Photo) -> some View {
        HStack(spacing: 14) {
            PhotoThumbnail(photo: photo)
                .frame(width: 74, height: 92)

            VStack(alignment: .leading, spacing: 4) {
                Text("Your photo is here now")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text(photo.caption.isEmpty ? "No note" : photo.caption)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.secondaryText)
                    .lineLimit(2)
                Text("Whoever comes next will find it.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.accent)
            }
            Spacer(minLength: 0)
        }
        .glassPanel(cornerRadius: 18, padding: 14)
        .onTapGesture { selected = photo }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Nothing else within \(Int(result.radiusUsed)) m — yet.")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
            Text("Your photo is the start of this place's collection.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassPanel(cornerRadius: 18, padding: 16)
    }

    private var grid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 14) {
            ForEach(others) { photo in
                Button {
                    selected = photo
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        PhotoThumbnail(photo: photo)
                            .frame(height: 175)
                        Text(photo.displayName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Text(subtitle(for: photo))
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.secondaryText)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func subtitle(for photo: Photo) -> String {
        let distance = photo.distanceM.map { "\($0) m away" } ?? ""
        let when = photo.takenDate.formatted(.dateTime.month(.abbreviated).year())
        return [distance, when].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}
