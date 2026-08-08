import SwiftUI

/// The explorer roster, reframed as "friends" — the roster already exists to
/// demonstrate that each person has their own private map, so switching who
/// you are *is* the friends feature here.
struct FriendsView: View {

    @ObservedObject var model: AppModel

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                VStack(spacing: 12) {
                    ForEach(Explorer.roster) { person in
                        friendRow(person)
                    }
                }
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
            Text("Friends")
                .font(.wander(26, weight: .heavy))
                .foregroundStyle(WanderTheme.textPrimary)
            Text("Everyone shares the same world, but nobody sees a place until they've stood there themselves.")
                .font(.wander(13))
                .foregroundStyle(WanderTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func friendRow(_ person: Explorer) -> some View {
        let isActive = person.id == model.explorer.id
        return Button {
            model.switchExplorer(to: person)
        } label: {
            HStack(spacing: 14) {
                ExplorerAvatar(explorer: person, size: 46)
                VStack(alignment: .leading, spacing: 2) {
                    Text(person.displayName)
                        .font(.wander(16, weight: .bold))
                        .foregroundStyle(WanderTheme.textPrimary)
                    Text(isActive ? "This is you right now" : "Tap to explore as \(person.displayName.split(separator: " ").first ?? "them")")
                        .font(.wander(12))
                        .foregroundStyle(WanderTheme.secondaryText)
                }
                Spacer(minLength: 0)
                if isActive {
                    PixelIcon(glyph: .checkmarkCircle, size: 20, color: WanderTheme.accent)
                } else {
                    PixelIcon(glyph: .chevronRight, size: 13, color: WanderTheme.secondaryText.opacity(0.6))
                }
            }
            .wanderCard(cornerRadius: 18, padding: 14, fill: isActive ? WanderTheme.panelSoft : WanderTheme.panel)
        }
        .buttonStyle(.plain)
    }
}
