import CoreLocation
import SwiftUI

/// Simulated travel.
///
/// Real background GPS is the eventual product; this is how you demonstrate a
/// year of wandering in ninety seconds without leaving the room. Flip "use real
/// GPS" and the same app runs on device location instead.
struct TravelSheet: View {

    @ObservedObject var model: AppModel
    /// Closes the sheet by clearing the parent's state directly.
    ///
    /// Not `@Environment(\.dismiss)`: starting a journey publishes location
    /// updates twenty times a second, and a re-render storm that overlaps the
    /// dismissal can swallow the binding write — leaving the sheet gone from
    /// screen but still "presented" as far as SwiftUI is concerned, after which
    /// no other sheet will open. Closing first and travelling after keeps the
    /// two from racing (and looks better: you watch the flight).
    let close: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        closeThen { model.wanderHere() }
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Walk around here").foregroundStyle(WanderTheme.textPrimary)
                                Text("Uncovers a few more streets on foot")
                                    .font(.caption)
                                    .foregroundStyle(WanderTheme.secondaryText)
                            }
                        } icon: {
                            PixelIcon(glyph: .person, size: 17, color: WanderTheme.accent)
                        }
                    }
                    .disabled(model.isTravelling)

                    Toggle(isOn: $model.usingRealGPS) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Use this device's real GPS").foregroundStyle(WanderTheme.textPrimary)
                            Text("Walk outside and the fog lifts for real")
                                .font(.caption)
                                .foregroundStyle(WanderTheme.secondaryText)
                        }
                    }
                    .tint(WanderTheme.accent)
                } header: {
                    Text("Where you are")
                } footer: {
                    Text("Tip: press and hold anywhere on the map to travel there.")
                }

                Section("Travel somewhere") {
                    ForEach(sortedPlaces) { place in
                        Button {
                            closeThen { model.travel(to: place) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(place.name).foregroundStyle(WanderTheme.textPrimary)
                                    Text("\(place.city), \(place.country)")
                                        .font(.caption)
                                        .foregroundStyle(WanderTheme.secondaryText)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(distanceLabel(to: place))
                                        .font(.wander(12, weight: .medium))
                                        .foregroundStyle(WanderTheme.secondaryText)
                                    if model.exploration.isExplored(place.coordinate) {
                                        HStack(spacing: 3) {
                                            PixelIcon(glyph: .checkmarkCircle, size: 11, color: WanderTheme.accent)
                                            Text("uncovered")
                                        }
                                        .font(.wander(10, weight: .semibold))
                                        .foregroundStyle(WanderTheme.accent)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(WanderTheme.background)
            .navigationTitle("Travel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { close() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(WanderTheme.background)
    }

    /// Dismiss, then act once the sheet is actually gone.
    private func closeThen(_ action: @escaping () -> Void) {
        close()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: action)
    }

    /// Nearest first — the list doubles as "what is close to me right now".
    private var sortedPlaces: [Place] {
        guard let here = model.location else { return Place.all }
        return Place.all.sorted { here.distance(from: $0.location) < here.distance(from: $1.location) }
    }

    private func distanceLabel(to place: Place) -> String {
        guard let here = model.location else { return "" }
        let metres = here.distance(from: place.location)
        return metres < 1000 ? "\(Int(metres)) m" : "\(Int(metres / 1000)) km"
    }
}
