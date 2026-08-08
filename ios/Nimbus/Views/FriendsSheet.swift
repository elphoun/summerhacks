import SwiftUI

/// Who you are, and whose photographs you can see.
///
/// This device has one identity and one map. The only thing that changes what
/// appears on it is who you add here — which is why the friend code sits at the
/// top, at a size you can read across a table.
struct FriendsSheet: View {

    @ObservedObject var model: AppModel
    let close: () -> Void

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
        NavigationStack {
            List {
                identitySection
                addFriendSection
                friendsSection

                Section {
                } footer: {
                    Text("You see the photographs your friends left — and only on ground you have uncovered yourself. Where you have been is never sent anywhere.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("You and your friends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { commitName(); close() }
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(Theme.background)
        .onAppear { name = model.explorer.displayName }
        .task { await model.refreshFriends() }
    }

    // MARK: You

    private var identitySection: some View {
        Section {
            HStack(spacing: 14) {
                ExplorerAvatar(
                    initials: Explorer.initials(of: name.isEmpty ? model.explorer.displayName : name),
                    color: model.explorer.color,
                    size: 46
                )
                VStack(alignment: .leading, spacing: 2) {
                    TextField("Your name", text: $name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                        .submitLabel(.done)
                        .onSubmit { commitName() }
                    Text("The name on every photo you leave")
                        .font(.caption)
                        .foregroundStyle(Theme.secondaryText)
                }
            }
            .padding(.vertical, 4)

            if let friendCode = model.explorer.friendCode {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Your code")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.secondaryText)
                        Text(friendCode)
                            .font(.system(size: 26, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)
                            .tracking(4)
                    }
                    Spacer()
                    Button {
                        UIPasteboard.general.string = friendCode
                        notice = Notice(text: "Code copied.")
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.accent)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 4)
            } else {
                Label("Waiting for the server to issue your code", systemImage: "clock")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.secondaryText)
            }
        } header: {
            Text("You")
        } footer: {
            Text("Give this code to someone to let them see the photographs you leave behind.")
        }
    }

    // MARK: Adding

    private var addFriendSection: some View {
        Section {
            HStack(spacing: 10) {
                TextField("ABC123", text: $code)
                    .font(.system(size: 17, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.white)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($codeFieldFocused)
                    .onSubmit { add() }

                Button(action: add) {
                    if isAdding {
                        ProgressView().tint(Theme.accent)
                    } else {
                        Text("Add")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(code.isEmpty ? Theme.secondaryText : Theme.accent)
                    }
                }
                .buttonStyle(.plain)
                .disabled(code.isEmpty || isAdding)
            }

            if let notice {
                Text(notice.text)
                    .font(.system(size: 13))
                    .foregroundStyle(notice.isError ? Theme.warm : Theme.accent)
            }
        } header: {
            Text("Add a friend")
        } footer: {
            Text("Type their code and you will start seeing what they left in the places you have both been. It works both ways at once.")
        }
    }

    // MARK: Their list

    private var friendsSection: some View {
        Section("Friends (\(model.friends.count))") {
            if model.friends.isEmpty {
                Text("Nobody yet. Add someone by their code and their memories start showing up on your map.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.secondaryText)
            } else {
                ForEach(model.friends) { friend in
                    HStack(spacing: 12) {
                        ExplorerAvatar(user: friend, size: 30)
                        Text(friend.displayName).foregroundStyle(.white)
                        Spacer()
                        if friend.isSeed == true {
                            Text("sample")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(Theme.secondaryText)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(.white.opacity(0.09)))
                        }
                    }
                }
            }
        }
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
