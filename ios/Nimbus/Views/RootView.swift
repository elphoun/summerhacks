import MapKit
import SwiftUI

struct RootView: View {

    @StateObject private var model = AppModel()
    @State private var sheet: ActiveSheet?
    @State private var tab: WanderTab = .home

    var body: some View {
        ZStack {
            WanderTheme.background.ignoresSafeArea()

            Group {
                switch tab {
                case .home:
                    HomeView(model: model, sheet: $sheet)
                case .map:
                    MapScreen(model: model, sheet: $sheet)
                case .friends:
                    FriendsView(model: model)
                case .stats:
                    StatsView(model: model)
                }
            }

            VStack {
                Spacer()
                WanderTabBar(tab: $tab) { sheet = .capture }
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .sheet(item: $sheet) { active in
            Group {
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
            .preferredColorScheme(.light)
        }
        .overlay(alignment: .bottom) { banner }
        .task { await model.checkServer() }
    }

    /// Single place that owns closing a sheet, so the sheets never have to rely
    /// on `dismiss()` propagating back into this state while the model is busy.
    private func closeSheet() {
        sheet = nil
    }

    @ViewBuilder
    private var banner: some View {
        if let banner = model.banner {
            Text(banner.text)
                .font(.wander(13, weight: .medium))
                .multilineTextAlignment(.center)
                .foregroundStyle(banner.isError ? WanderTheme.warm : WanderTheme.textPrimary)
                .wanderCard(cornerRadius: 14, padding: 14)
                .padding(.horizontal, 24)
                .padding(.bottom, 150)
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
