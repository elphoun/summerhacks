import SwiftUI

/// Your own record of where you have been — and the place the app states, in
/// as many words, that this record belongs to you alone.
struct HistorySheet: View {

    @ObservedObject var model: AppModel
    /// See TravelSheet.close — resetting republishes enough state to race an
    /// in-flight dismissal.
    let close: () -> Void

    @State private var confirmingReset = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 0) {
                        statTile(areaText, "uncovered")
                        statTile("\(model.exploration.placesDiscovered)", "places")
                        statTile("\(model.exploration.photosLeft)", "photos left")
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }

                Section {
                    HStack(spacing: 12) {
                        ExplorerAvatar(explorer: model.explorer, size: 30)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.explorer.displayName)
                                .foregroundStyle(WanderTheme.textPrimary)
                            Text("\(model.friends.count) friends")
                                .font(.caption)
                                .foregroundStyle(WanderTheme.secondaryText)
                        }
                        Spacer()
                    }
                } header: {
                    Text("Who you are")
                } footer: {
                    Text("This map is yours alone. It is stored on this device and never sent anywhere — no friend of yours can uncover ground for you, and you cannot uncover any for them. The photographs everyone leaves behind are the only thing shared.")
                }

                Section("Places you found") {
                    if model.exploration.mostRecentVisits.isEmpty {
                        Text("Nothing yet. The world is still under cloud.")
                            .foregroundStyle(WanderTheme.secondaryText)
                    } else {
                        ForEach(model.exploration.mostRecentVisits) { visit in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(visit.placeName).foregroundStyle(WanderTheme.textPrimary)
                                    Text("\(visit.city), \(visit.country)")
                                        .font(.caption)
                                        .foregroundStyle(WanderTheme.secondaryText)
                                }
                                Spacer()
                                Text(visit.firstSeen.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption)
                                    .foregroundStyle(WanderTheme.secondaryText)
                            }
                        }
                    }
                }

                Section {
                    Button(role: .destructive) {
                        confirmingReset = true
                    } label: {
                        Label {
                            Text("Cloud this map over again")
                        } icon: {
                            PixelIcon(glyph: .cloud, size: 15, color: .red)
                        }
                    }
                } header: {
                    Text("Demo")
                } footer: {
                    Text("Resets only what you have uncovered. Photos left in the world are not deleted, and your friends are kept.\n\nServer: \(Config.serverBaseURL.absoluteString)")
                }
            }
            .scrollContentBackground(.hidden)
            .background(WanderTheme.background)
            .navigationTitle("Your exploration")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { close() }
                }
            }
            .alert("Cloud this map over?", isPresented: $confirmingReset) {
                Button("Cancel", role: .cancel) {}
                Button("Reset", role: .destructive) {
                    closeThen { model.resetExploration() }
                }
            } message: {
                Text("You will start again from \(Place.home.city), with everywhere back under cloud.")
            }
        }
        .presentationDetents([.large])
        .presentationBackground(WanderTheme.background)
    }

    /// Dismiss, then act once the sheet is actually gone.
    private func closeThen(_ action: @escaping () -> Void) {
        close()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: action)
    }

    private func statTile(_ value: String, _ caption: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.wander(20, weight: .bold))
                .foregroundStyle(WanderTheme.textPrimary)
            Text(caption)
                .font(.wander(11))
                .foregroundStyle(WanderTheme.secondaryText)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
    }

    private var areaText: String {
        let area = model.exploration.uncoveredAreaKm2
        return area < 10 ? String(format: "%.1f km²", area) : "\(Int(area)) km²"
    }
}
