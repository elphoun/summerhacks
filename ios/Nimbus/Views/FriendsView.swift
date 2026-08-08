import SwiftUI

/// Who you are, and whose photographs you can see.
///
/// This device has one identity and one map. The only thing that changes what
/// appears on it is who you add here — which is why the friend code sits near
/// the top, at a size you can read across a table.
struct FriendsView: View {

    @ObservedObject var model: AppModel

    @State private var name = ""
    @State private var code = ""
    @State private var isAdding = false
    @State private var notice: Notice?
    @FocusState private var codeFieldFocused: Bool

    private struct Notice: Equatable {
        let text: String
        var isError = false
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                identityCard
                addFriendCard
                friendList
                footnote
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .background(WanderTheme.background.ignoresSafeArea())
        .scrollIndicators(.hidden)
        .onAppear { name = model.explorer.displayName }
        .task { await model.refreshFriends() }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Friends")
                .font(.wander(26, weight: .heavy))
                .foregroundStyle(WanderTheme.textPrimary)
            Text("You see the photographs your friends left — and only on ground you have uncovered yourself.")
                .font(.wander(13))
                .foregroundStyle(WanderTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: You

    private var identityCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                ExplorerAvatar(
                    initials: Explorer.initials(of: name.isEmpty ? model.explorer.displayName : name),
                    color: model.explorer.color,
                    size: 46
                )
                VStack(alignment: .leading, spacing: 2) {
                    TextField("Your name", text: $name)
                        .font(.wander(16, weight: .bold))
                        .foregroundStyle(WanderTheme.textPrimary)
                        .submitLabel(.done)
                        .onSubmit { commitName() }
                    Text("The name on every photo you leave")
                        .font(.wander(12))
                        .foregroundStyle(WanderTheme.secondaryText)
                }
                Spacer(minLength: 0)
            }

            Rectangle().fill(WanderTheme.hairline).frame(height: 1)

            if let friendCode = model.explorer.friendCode {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("YOUR CODE")
                            .font(.wander(11, weight: .semibold))
                            .foregroundStyle(WanderTheme.secondaryText)
                        Text(friendCode)
                            .font(.wander(26, weight: .heavy))
                            .foregroundStyle(WanderTheme.textPrimary)
                            .tracking(4)
                    }
                    Spacer(minLength: 0)
                    Button {
                        UIPasteboard.general.string = friendCode
                        notice = Notice(text: "Code copied.")
                    } label: {
                        Text("Copy")
                            .font(.wander(13, weight: .bold))
                            .foregroundStyle(WanderTheme.accent)
                    }
                    .buttonStyle(.plain)
                }
                Text("Give this to someone to let them see what you leave behind.")
                    .font(.wander(12))
                    .foregroundStyle(WanderTheme.secondaryText)
            } else {
                HStack(spacing: 8) {
                    PixelIcon(glyph: .clock, size: 14, color: WanderTheme.secondaryText)
                    Text("Waiting for the server to issue your code")
                        .font(.wander(13))
                        .foregroundStyle(WanderTheme.secondaryText)
                }
            }
        }
        .wanderCard(cornerRadius: 18, padding: 16)
    }

    // MARK: Adding

    private var addFriendCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                PixelIcon(glyph: .users, size: 16, color: WanderTheme.accent)
                Text("Add a friend")
                    .font(.wander(15, weight: .bold))
                    .foregroundStyle(WanderTheme.textPrimary)
            }

            HStack(spacing: 10) {
                TextField("ABC123", text: $code)
                    .font(.wander(17, weight: .bold))
                    .foregroundStyle(WanderTheme.textPrimary)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($codeFieldFocused)
                    .onSubmit { add() }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(WanderTheme.panelSoft, in: PixelRoundedRect(radius: 12, steps: 2))
                    .overlay(
                        PixelRoundedRect(radius: 12, steps: 2)
                            .stroke(WanderTheme.hairline, lineWidth: 1.5)
                    )

                Button(action: add) {
                    Group {
                        if isAdding {
                            ProgressView().tint(WanderTheme.background)
                        } else {
                            Text("Add").font(.wander(15, weight: .bold))
                        }
                    }
                    .foregroundStyle(WanderTheme.background)
                    .frame(width: 70, height: 42)
                    .background(
                        (code.isEmpty ? WanderTheme.secondaryText : WanderTheme.accent),
                        in: PixelRoundedRect(radius: 12, steps: 2)
                    )
                }
                .buttonStyle(.plain)
                .disabled(code.isEmpty || isAdding)
            }

            if let notice {
                Text(notice.text)
                    .font(.wander(12, weight: .medium))
                    .foregroundStyle(notice.isError ? WanderTheme.warm : WanderTheme.accent)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text("Type their code and you start seeing what they left in the places you have both been. It works both ways at once.")
                .font(.wander(12))
                .foregroundStyle(WanderTheme.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .wanderCard(cornerRadius: 18, padding: 16)
    }

    // MARK: Their list

    private var friendList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(model.friends.count) FRIENDS")
                .font(.wander(11, weight: .semibold))
                .foregroundStyle(WanderTheme.secondaryText)
                .frame(maxWidth: .infinity, alignment: .leading)

            if model.friends.isEmpty {
                Text("Nobody yet. Add someone by their code and their memories start showing up on your map.")
                    .font(.wander(13))
                    .foregroundStyle(WanderTheme.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .wanderCard(cornerRadius: 18, padding: 14)
            } else {
                ForEach(model.friends) { friend in
                    HStack(spacing: 14) {
                        ExplorerAvatar(user: friend, size: 46)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(friend.displayName)
                                .font(.wander(16, weight: .bold))
                                .foregroundStyle(WanderTheme.textPrimary)
                            Text(friend.isSeed == true ? "One of the sample explorers" : "Added by code")
                                .font(.wander(12))
                                .foregroundStyle(WanderTheme.secondaryText)
                        }
                        Spacer(minLength: 0)
                        PixelIcon(glyph: .checkmarkCircle, size: 18, color: WanderTheme.accent)
                    }
                    .wanderCard(cornerRadius: 18, padding: 14)
                }
            }
        }
    }

    private var footnote: some View {
        Text("Where you have been is never sent anywhere. No friend of yours can uncover ground for you, and you cannot uncover any for them.")
            .font(.wander(12))
            .foregroundStyle(WanderTheme.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
    }

    // MARK: Actions

    private func commitName() {
        model.rename(to: name)
        name = model.explorer.displayName
    }

    private func add() {
        guard !code.isEmpty, !isAdding else { return }
        codeFieldFocused = false
        isAdding = true
        notice = nil

        Task {
            switch await model.addFriend(code: code) {
            case .added(let who):
                notice = Notice(text: "\(who) is now a friend. Their photos are on your map.")
                code = ""
            case .failed(let message):
                notice = Notice(text: message, isError: true)
            }
            isAdding = false
        }
    }
}
