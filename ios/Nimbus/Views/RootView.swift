import MapKit
import SwiftUI

struct RootView: View {

    @StateObject private var model = AppModel()
    @State private var sheet: ActiveSheet?

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
            .padding(.bottom, 8)
        }
        .preferredColorScheme(.dark)
        .sheet(item: $sheet) { active in
            switch active {
            case .travel:
                TravelSheet(model: model, close: closeSheet)
            case .capture:
                CaptureSheet(model: model, close: closeSheet) { outcome in
                    // Dismiss first, then present: swapping one item-based sheet
                    // straight for another drops the second presentation.
                    sheet = nil
                    let presentation = NearbyPresentation(justUploaded: outcome.photo, result: outcome.nearby)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                        sheet = .nearby(presentation)
                    }
                }
            case .history:
                HistorySheet(model: model, close: closeSheet)
            case .nearby(let presentation):
                NearbySheet(presentation: presentation, close: closeSheet)
            case .photo(let photo):
                PhotoDetailView(photo: photo, from: model.location)
            }
        }
        .overlay(alignment: .bottom) { banner }
        .task { await model.checkServer() }
    }

    /// Single place that owns closing a sheet, so the sheets never have to rely
    /// on `dismiss()` propagating back into this state while the model is busy.
    private func closeSheet() {
        sheet = nil
    }

    // MARK: Chrome

    private var topBar: some View {
        HStack(alignment: .top, spacing: 10) {
            Menu {
                Section("Switch explorer") {
                    ForEach(Explorer.roster) { person in
                        Button {
                            model.switchExplorer(to: person)
                        } label: {
                            Label(
                                person.displayName,
                                systemImage: person.id == model.explorer.id ? "checkmark.circle.fill" : "person.circle"
                            )
                        }
                    }
                }
                Button {
                    sheet = .history
                } label: {
                    Label("Exploration history", systemImage: "clock.arrow.circlepath")
                }
            } label: {
                HStack(spacing: 9) {
                    ExplorerAvatar(explorer: model.explorer)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(model.explorer.displayName)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                        Text("your private map")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.secondaryText)
                    }
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.secondaryText)
                }
                .glassPanel(cornerRadius: 22, padding: 8)
            }

            Spacer(minLength: 0)

            VStack(alignment: .trailing, spacing: 6) {
                statsPill
                if model.hiddenPhotoCount > 0 {
                    Label("\(model.hiddenPhotoCount) still under cloud", systemImage: "cloud.fill")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.secondaryText)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                if model.serverReachable == false {
                    Label("server offline", systemImage: "wifi.slash")
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
                    Image(systemName: "location.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(.ultraThinMaterial, in: Circle())
                        .overlay(Circle().stroke(Theme.hairline, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            if model.isTravelling {
                Label("moving — clouds burning off", systemImage: "figure.walk")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
                    .transition(.scale.combined(with: .opacity))
            }

            HStack(spacing: 14) {
                CircleGlassButton(systemImage: "airplane.departure", label: "Travel") {
                    sheet = .travel
                }

                Button {
                    sheet = .capture
                } label: {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(Theme.background)
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

                CircleGlassButton(systemImage: "clock.arrow.circlepath", label: "History") {
                    sheet = .history
                }
            }
        }
        .animation(.spring(duration: 0.3), value: model.isTravelling)
    }

    @ViewBuilder
    private var banner: some View {
        if let banner = model.banner {
            Text(banner.text)
                .font(.system(size: 13, weight: .medium))
                .multilineTextAlignment(.center)
                .foregroundStyle(banner.isError ? Theme.warm : .white)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Theme.hairline, lineWidth: 1)
                )
                .padding(.horizontal, 24)
                .padding(.bottom, 160)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .task(id: banner.id) {
                    try? await Task.sleep(for: .seconds(banner.isError ? 6 : 3.2))
                    if model.banner?.id == banner.id { model.banner = nil }
                }
        }
    }
}

// MARK: - Sheet routing

struct NearbyPresentation: Identifiable {
    let id = UUID()
    let justUploaded: Photo?
    let result: NearbyResult
}

enum ActiveSheet: Identifiable {
    case travel
    case capture
    case history
    case nearby(NearbyPresentation)
    case photo(Photo)

    var id: String {
        switch self {
        case .travel: "travel"
        case .capture: "capture"
        case .history: "history"
        case .nearby(let presentation): "nearby-\(presentation.id)"
        case .photo(let photo): "photo-\(photo.id)"
        }
    }
}
