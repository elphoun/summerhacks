import PhotosUI
import SwiftUI

/// Leaving a photo at a place.
///
/// Three ways in, on purpose: the camera on a real device, the photo library,
/// and a generated sample shot so the flow is still demonstrable on a simulator
/// that has neither.
struct CaptureSheet: View {

    @ObservedObject var model: AppModel
    let close: () -> Void
    let onFinished: (AppModel.CaptureOutcome) -> Void

    @State private var image: UIImage?
    @State private var caption = ""
    @State private var isUploading = false
    @State private var showCamera = false
    @State private var pickerItem: PhotosPickerItem?

    /// The iOS 26 simulator *claims* a camera — `isSourceTypeAvailable(.camera)`
    /// returns true and MobileGestalt reports the hardware — but the viewfinder
    /// never opens, so tapping through lands you on a dead black screen. Trust
    /// the device check only where it can be true.
    private static var cameraIsUsable: Bool {
        #if targetEnvironment(simulator)
        false
        #else
        UIImagePickerController.isSourceTypeAvailable(.camera)
        #endif
    }

    var body: some View {
        NavigationStack {
            Group {
                if let image {
                    composer(for: image)
                } else {
                    chooser
                }
            }
            .background(WanderTheme.background)
            .navigationTitle(image == nil ? "Leave a memory" : "Add a note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { close() }.disabled(isUploading)
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(WanderTheme.background)
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { picked in image = picked }
                .ignoresSafeArea()
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let loaded = UIImage(data: data) {
                    image = loaded
                }
            }
        }
    }

    // MARK: Choosing a photo

    private var chooser: some View {
        VStack(spacing: 18) {
            VStack(spacing: 6) {
                Text(model.currentPlaceName ?? "Right here")
                    .font(.wander(22, weight: .bold))
                    .foregroundStyle(WanderTheme.textPrimary)
                if let location = model.location {
                    Text(String(format: "%.5f, %.5f", location.coordinate.latitude, location.coordinate.longitude))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(WanderTheme.secondaryText)
                }
                Text("Your photo stays here for whoever comes next.")
                    .font(.wander(13))
                    .foregroundStyle(WanderTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.top, 2)
            }
            .padding(.top, 24)

            VStack(spacing: 12) {
                if Self.cameraIsUsable {
                    sourceButton("Take a photo", glyph: .camera, prominent: true) {
                        showCamera = true
                    }
                }

                PhotosPicker(selection: $pickerItem, matching: .images) {
                    sourceLabel("Choose from library", glyph: .image, prominent: false)
                }
                .buttonStyle(.plain)

                sourceButton("Use a sample shot", glyph: .sparkles, prominent: !Self.cameraIsUsable) {
                    image = SampleShotRenderer.make()
                }

                if !Self.cameraIsUsable {
                    Text("No camera here — the sample shot stands in for one.")
                        .font(.caption)
                        .foregroundStyle(WanderTheme.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
            }
            .padding(.horizontal, 20)

            Spacer()
        }
    }

    private func sourceButton(_ title: String,
                              glyph: PixelGlyph,
                              prominent: Bool,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            sourceLabel(title, glyph: glyph, prominent: prominent)
        }
        .buttonStyle(.plain)
    }

    private func sourceLabel(_ title: String, glyph: PixelGlyph, prominent: Bool) -> some View {
        HStack(spacing: 10) {
            PixelIcon(glyph: glyph, size: 18, color: prominent ? .white : WanderTheme.textPrimary)
            Text(title).font(.wander(16, weight: .semibold))
            Spacer()
        }
        .foregroundStyle(prominent ? .white : WanderTheme.textPrimary)
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background {
            if prominent {
                PixelRoundedRect(radius: 16, steps: 2).fill(WanderTheme.warm)
            } else {
                PixelRoundedRect(radius: 16, steps: 2)
                    .fill(WanderTheme.panel)
                    .overlay(
                        PixelRoundedRect(radius: 16, steps: 2)
                            .stroke(WanderTheme.hairline, lineWidth: 1)
                    )
            }
        }
    }

    // MARK: Captioning and upload

    private func composer(for image: UIImage) -> some View {
        VStack(spacing: 16) {
            Color.clear
                .frame(height: 340)
                .overlay {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                }
                .clipped()
                .clipShape(PixelRoundedRect(radius: 20, steps: 2))
                .overlay(
                    PixelRoundedRect(radius: 20, steps: 2)
                        .stroke(WanderTheme.hairline, lineWidth: 1)
                )
                .padding(.horizontal, 20)
                .padding(.top, 16)

            TextField("Say something about this place…", text: $caption, axis: .vertical)
                .lineLimit(1...3)
                .textFieldStyle(.plain)
                .padding(14)
                .background(WanderTheme.panel, in: PixelRoundedRect(radius: 14, steps: 2))
                .overlay(
                    PixelRoundedRect(radius: 14, steps: 2)
                        .stroke(WanderTheme.hairline, lineWidth: 1)
                )
                .padding(.horizontal, 20)

            Button {
                upload(image)
            } label: {
                HStack(spacing: 8) {
                    if isUploading {
                        ProgressView().tint(.white)
                    }
                    Text(isUploading ? "Leaving it here…" : "Leave this photo here")
                        .font(.wander(16, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(PixelRoundedRect(radius: 16, steps: 2).fill(WanderTheme.warm))
            }
            .buttonStyle(.plain)
            .disabled(isUploading)
            .padding(.horizontal, 20)

            Button("Pick a different photo") {
                self.image = nil
                caption = ""
            }
            .font(.wander(13))
            .foregroundStyle(WanderTheme.secondaryText)
            .disabled(isUploading)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .top)
    }

    private func upload(_ image: UIImage) {
        isUploading = true
        Task {
            let outcome = await model.leavePhoto(imageData: image.uploadPayload(), caption: caption)
            isUploading = false
            guard let outcome else { return }
            onFinished(outcome)
        }
    }
}

// MARK: - Camera

/// The system camera. Only reachable on a real device.
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let controller = UIImagePickerController()
        controller.sourceType = .camera
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        private let parent: CameraPicker

        init(_ parent: CameraPicker) {
            self.parent = parent
        }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.onImage(image)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

extension UIImage {
    /// Downscaled JPEG bytes. Phone cameras produce far more pixels than a
    /// gallery thumbnail needs, and the upload travels as base64.
    func uploadPayload(maxDimension: CGFloat = 1_600, quality: CGFloat = 0.82) -> Data {
        let longest = max(size.width, size.height)
        guard longest > maxDimension else {
            return jpegData(compressionQuality: quality) ?? Data()
        }

        let scale = maxDimension / longest
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let scaled = UIGraphicsImageRenderer(size: target).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
        return scaled.jpegData(compressionQuality: quality) ?? Data()
    }
}
