import MapKit
import SwiftUI

/// The Home tab — everything from the mock except the map itself, which is
/// the same `ExplorationMapView` the Map tab uses, just framed as a card here.
struct HomeView: View {

    @ObservedObject var model: AppModel
    @Binding var sheet: ActiveSheet?

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                welcomeCard
                mapCard
                statsRow
                recentAdventures
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .background(WanderTheme.background.ignoresSafeArea())
        .scrollIndicators(.hidden)
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            Spacer(minLength: 0)
            Image("WanderLogo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 130)
            Spacer(minLength: 0)
        }
        .overlay(alignment: .trailing) {
            Button {
                sheet = .history
            } label: {
                PixelIcon(glyph: .gear, size: 18, color: WanderTheme.textPrimary)
                    .frame(width: 42, height: 42)
                    .wanderCard(cornerRadius: 13, padding: 0)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: Welcome

    private var welcomeCard: some View {
        HStack(spacing: 14) {
            ExplorerAvatar(explorer: model.explorer, size: 52)
            VStack(alignment: .leading, spacing: 4) {
                Text("Welcome back, \(firstName)!")
                    .font(.wander(18, weight: .bold))
                    .foregroundStyle(WanderTheme.textPrimary)
                HStack(spacing: 8) {
                    HStack(spacing: 4) {
                        PixelIcon(glyph: .flame, size: 13, color: WanderTheme.warm)
                        Text("\(model.exploration.streakDays) day streak")
                            .foregroundStyle(WanderTheme.warm)
                    }
                    Text("|")
                        .foregroundStyle(WanderTheme.hairline)
                    HStack(spacing: 4) {
                        PixelIcon(glyph: .steps, size: 13, color: WanderTheme.accent)
                        Text("\(model.exploration.estimatedSteps.formatted()) steps")
                            .foregroundStyle(WanderTheme.accent)
                    }
                }
                .font(.wander(13, weight: .semibold))
            }
            Spacer(minLength: 0)
        }
    }

    private var firstName: String {
        String(model.explorer.displayName.split(separator: " ").first ?? "Explorer")
    }

    // MARK: Map card

    private var mapCard: some View {
        ExplorationMapView(
            points: model.explorationPoints,
            fogVersion: model.fogVersion,
            photos: model.visiblePhotos,
            userLocation: model.location,
            userColor: UIColor(model.explorer.color),
            focus: model.focus,
            followsUser: model.followsUser,
            onLongPress: { coordinate in model.travel(to: coordinate, named: nil) },
            onSelect: { photo in sheet = .photo(photo) },
            onRegionChange: { region in model.regionChanged(region) }
        )
        .frame(height: 380)
        .clipShape(PixelRoundedRect(radius: 28, steps: 3))
        .overlay(
            PixelRoundedRect(radius: 28, steps: 3)
                .stroke(WanderTheme.textPrimary, lineWidth: 5)
        )
        .overlay(
            PixelRoundedRect(radius: 24, steps: 3)
                .inset(by: 5)
                .stroke(WanderTheme.warm.opacity(0.85), lineWidth: 2)
        )
        .shadow(color: WanderTheme.shadow, radius: 12, y: 6)
        .overlay(alignment: .bottomTrailing) {
            Button {
                model.centreOnMe()
            } label: {
                PixelIcon(glyph: .locationPin, size: 30, color: WanderTheme.warm)
                    .background(Circle().fill(WanderTheme.panel).padding(3))
                    .shadow(color: WanderTheme.shadow, radius: 6, y: 3)
            }
            .buttonStyle(.plain)
            .padding(14)
        }
    }

    // MARK: Stats row

    private var statsRow: some View {
        HStack(spacing: 0) {
            statItem(icon: .seedling, tint: WanderTheme.accent, title: "Places\nDiscovered", value: "\(model.exploration.placesDiscovered)")
            divider
            statItem(icon: .camera, tint: WanderTheme.secondaryText, title: "Photos\nTaken", value: "\(model.exploration.photosLeft)")
            divider
            statItem(icon: .locationPin, tint: WanderTheme.warm, title: "Distance\nExplored", value: model.exploration.totalDistanceM.metresLabel)
        }
        .wanderCard(cornerRadius: 20, padding: 16)
    }

    private var divider: some View {
        Divider().overlay(WanderTheme.hairline).padding(.vertical, 4)
    }

    private func statItem(icon: PixelGlyph, tint: Color, title: String, value: String) -> some View {
        VStack(spacing: 6) {
            PixelIcon(glyph: icon, size: 22, color: tint)
            Text(value)
                .font(.wander(15, weight: .bold))
                .foregroundStyle(WanderTheme.textPrimary)
            Text(title)
                .font(.wander(11, weight: .semibold))
                .foregroundStyle(WanderTheme.secondaryText)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Recent adventures

    private var recentPhotos: [Photo] {
        model.visiblePhotos.sorted { $0.takenDate > $1.takenDate }.prefix(8).map { $0 }
    }

    private var recentAdventures: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text("RECENT ADVENTURES")
                    .font(.wander(14, weight: .heavy))
                    .kerning(0.5)
                    .foregroundStyle(WanderTheme.textPrimary)
            }
            .frame(maxWidth: .infinity)

            if recentPhotos.isEmpty {
                Text("Nothing left behind yet — go take a photo somewhere you've uncovered.")
                    .font(.wander(13))
                    .foregroundStyle(WanderTheme.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(spacing: 12) {
                    ScrollView(.horizontal) {
                        HStack(spacing: 12) {
                            ForEach(recentPhotos) { photo in
                                Button {
                                    sheet = .photo(photo)
                                } label: {
                                    PhotoThumbnail(photo: photo, cornerRadius: 12)
                                        .frame(width: 96, height: 128)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .scrollIndicators(.hidden)

                    Button {
                        sheet = .history
                    } label: {
                        PixelIcon(glyph: .chevronRight, size: 14, color: WanderTheme.textPrimary)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(WanderTheme.panelSoft))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .wanderCard(cornerRadius: 20, padding: 16)
    }
}
