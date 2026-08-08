import MapKit
import SwiftUI

/// The full-bleed exploration map — unchanged from the original design. This
/// is "the map feature": dark glass chrome floating over `ExplorationMapView`,
/// with its own travel/capture/history controls. `RootView` hosts it as the
/// Map tab; everything else in the app got a new look, this screen did not.
struct MapScreen: View {

    @ObservedObject var model: AppModel
    @Binding var sheet: ActiveSheet?

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

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
            .ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                Spacer()
                bottomBar
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 100)
        }
        .preferredColorScheme(.dark)
    }

    // MARK: Chrome

    private var topBar: some View {
        HStack(alignment: .top, spacing: 10) {
            // Who this map belongs to. There is nobody to switch to — one
            // device is one person — so this states rather than offers.
            HStack(spacing: 9) {
                ExplorerAvatar(explorer: model.explorer)
                VStack(alignment: .leading, spacing: 1) {
                    Text(model.explorer.displayName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                    Text(friendsLabel)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.secondaryText)
                }
            }
            .glassPanel(cornerRadius: 22, padding: 8)

            Spacer(minLength: 0)

            VStack(alignment: .trailing, spacing: 6) {
                statsPill
                if model.hiddenPhotoCount > 0 {
                    HStack(spacing: 5) {
                        PixelIcon(glyph: .cloud, size: 12, color: Theme.secondaryText)
                        Text("\(model.hiddenPhotoCount) still under cloud")
                    }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.secondaryText)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
                }
                if model.serverReachable == false {
                    HStack(spacing: 5) {
                        PixelIcon(glyph: .wifi, size: 12, color: Theme.warm)
                        Text("server offline")
                    }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.warm)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
                }
            }
        }
        .padding(.top, 6)
    }

    private var friendsLabel: String {
        switch model.friends.count {
        case 0: "no friends yet"
        case 1: "1 friend"
        default: "\(model.friends.count) friends"
        }
    }

    private var statsPill: some View {
        HStack(spacing: 10) {
            stat(value: areaText, caption: "uncovered")
            Divider().frame(height: 22).overlay(Theme.hairline)
            stat(value: "\(model.exploration.placesDiscovered)", caption: "places")
        }
        .glassPanel(cornerRadius: 16, padding: 10)
    }

    private func stat(value: String, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(caption)
                .font(.system(size: 10))
                .foregroundStyle(Theme.secondaryText)
        }
    }

    private var areaText: String {
        let area = model.exploration.uncoveredAreaKm2
        return area < 10 ? String(format: "%.1f km²", area) : "\(Int(area)) km²"
    }

    private var bottomBar: some View {
        VStack(spacing: 12) {
            HStack {
                Spacer()
                Button {
                    model.centreOnMe()
                } label: {
                    PixelIcon(glyph: .locationPin, size: 17, color: .white)
                        .frame(width: 40, height: 40)
                        .background(.ultraThinMaterial, in: Circle())
                        .overlay(Circle().stroke(Theme.hairline, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            if model.isTravelling {
                HStack(spacing: 6) {
                    PixelIcon(glyph: .person, size: 13, color: .white)
                    Text("moving — clouds burning off")
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
                .transition(.scale.combined(with: .opacity))
            }

            HStack(spacing: 14) {
                CircleGlassButton(glyph: .planeDeparture, label: "Travel") {
                    sheet = .travel
                }

                Button {
                    sheet = .capture
                } label: {
                    PixelIcon(glyph: .camera, size: 28, color: Theme.background)
                        .frame(width: 74, height: 74)
                        .background(
                            Circle().fill(
                                LinearGradient(
                                    colors: [.white, Theme.accent.opacity(0.75)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                        )
                        .shadow(color: Theme.accent.opacity(0.45), radius: 16, y: 6)
                }
                .buttonStyle(.plain)

                CircleGlassButton(glyph: .clock, label: "History") {
                    sheet = .history
                }
            }
        }
        .animation(.spring(duration: 0.3), value: model.isTravelling)
    }
}
