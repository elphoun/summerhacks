import SwiftUI

/// A fuller breakdown of one explorer's progress: the numbers from the Home
/// stat row, plus the streak/steps from the welcome card, plus the places
/// they've actually reached.
struct StatsView: View {

    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                bigNumbers
                visitedList
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .background(WanderTheme.background.ignoresSafeArea())
        .scrollIndicators(.hidden)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Stats")
                .font(.wander(26, weight: .heavy))
                .foregroundStyle(WanderTheme.textPrimary)
            Text("\(model.explorer.displayName)'s progress so far.")
                .font(.wander(13))
                .foregroundStyle(WanderTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var bigNumbers: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            tile(icon: .cloud, tint: WanderTheme.accent, value: areaText, caption: "world uncovered")
            tile(icon: .seedling, tint: WanderTheme.accent, value: "\(model.exploration.placesDiscovered)", caption: "places discovered")
            tile(icon: .camera, tint: WanderTheme.warm, value: "\(model.exploration.photosLeft)", caption: "photos left behind")
            tile(icon: .locationPin, tint: WanderTheme.warm, value: model.exploration.totalDistanceM.metresLabel, caption: "distance explored")
            tile(icon: .flame, tint: WanderTheme.warm, value: "\(model.exploration.streakDays)", caption: "day streak")
            tile(icon: .steps, tint: WanderTheme.accent, value: model.exploration.estimatedSteps.formatted(), caption: "steps taken")
        }
    }

    private func tile(icon: PixelGlyph, tint: Color, value: String, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            PixelIcon(glyph: icon, size: 20, color: tint)
            Text(value)
                .font(.wander(20, weight: .bold))
                .foregroundStyle(WanderTheme.textPrimary)
            Text(caption)
                .font(.wander(11, weight: .semibold))
                .foregroundStyle(WanderTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .wanderCard(cornerRadius: 18, padding: 14)
    }

    private var areaText: String {
        let area = model.exploration.uncoveredAreaKm2
        return area < 10 ? String(format: "%.1f km²", area) : "\(Int(area)) km²"
    }

    private var visitedList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("PLACES YOU'VE FOUND")
                .font(.wander(13, weight: .heavy))
                .kerning(0.4)
                .foregroundStyle(WanderTheme.textPrimary)

            if model.exploration.mostRecentVisits.isEmpty {
                Text("Nothing yet — the world is still under cloud.")
                    .font(.wander(13))
                    .foregroundStyle(WanderTheme.secondaryText)
            } else {
                VStack(spacing: 10) {
                    ForEach(model.exploration.mostRecentVisits) { visit in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(visit.placeName)
                                    .font(.wander(14, weight: .semibold))
                                    .foregroundStyle(WanderTheme.textPrimary)
                                Text("\(visit.city), \(visit.country)")
                                    .font(.wander(12))
                                    .foregroundStyle(WanderTheme.secondaryText)
                            }
                            Spacer()
                            Text(visit.firstSeen.formatted(date: .abbreviated, time: .omitted))
                                .font(.wander(11))
                                .foregroundStyle(WanderTheme.secondaryText)
                        }
                        if visit.id != model.exploration.mostRecentVisits.last?.id {
                            Divider().overlay(WanderTheme.hairline)
                        }
                    }
                }
            }
        }
        .wanderCard(cornerRadius: 20, padding: 16)
    }
}
