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
            .background(Theme.background)
            .navigationTitle(image == nil ? "Leave a memory" : "Add a note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { close() }.disabled(isUploading)
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(Theme.background)
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
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                if let location = model.location {
                    Text(String(format: "%.5f, %.5f", location.coordinate.latitude, location.coordinate.longitude))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Theme.secondaryText)
                }
                Text("Your photo stays here for whoever comes next.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.top, 2)
            }
            .padding(.top, 24)

            VStack(spacing: 12) {
                if Self.cameraIsUsable {
                    sourceButton("Take a photo", systemImage: "camera.fill", prominent: true) {
                        showCamera = true
                    }
                }

                PhotosPicker(selection: $pickerItem, matching: .images) {
                    sourceLabel("Choose from library", systemImage: "photo.on.rectangle", prominent: false)
                }
                .buttonStyle(.plain)

                sourceButton("Use a sample shot", systemImage: "wand.and.stars", prominent: !Self.cameraIsUsable) {
                    image = SampleShotRenderer.make()
                }

                if !Self.cameraIsUsable {
                    Text("No camera here — the sample shot stands in for one.")
                        .font(.caption)
                        .foregroundStyle(Theme.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
            }
            .padding(.horizontal, 20)

            Spacer()
        }
    }

    private func sourceButton(_ title: String,
                              systemImage: String,
                              prominent: Bool,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            sourceLabel(title, systemImage: systemImage, prominent: prominent)
        }
        .buttonStyle(.plain)
    }

    private func sourceLabel(_ title: String, systemImage: String, prominent: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
            Text(title).font(.system(size: 16, weight: .semibold))
            Spacer()
        }
        .foregroundStyle(prominent ? Theme.background : .white)
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background {
            if prominent {
                RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white)
            } else {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Theme.hairline, lineWidth: 1)
                    )
            }
        }
    }

    // MARK: Captioning and upload

    private func composer(for image: UIImage) -> some View {
        VStack(spacing: 16) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .frame(height: 340)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(Theme.hairline, lineWidth: 1)
                )
                .padding(.horizontal, 20)
                .padding(.top, 16)

            TextField("Say something about this place…", text: $caption, axis: .vertical)
                .lineLimit(1...3)
                .textFieldStyle(.plain)
                .padding(14)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Theme.hairline, lineWidth: 1)
                )
                .padding(.horizontal, 20)

            Button {
                upload(image)
            } label: {
                HStack(spacing: 8) {
                    if isUploading {
                        ProgressView().tint(Theme.background)
                    }
                    Text(isUploading ? "Leaving it here…" : "Leave this photo here")
                        .font(.system(size: 16, weight: .semibold))
                }
                .foregroundStyle(Theme.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white))
            }
            .buttonStyle(.plain)
            .disabled(isUploading)
            .padding(.horizontal, 20)

            Button("Pick a different photo") {
                self.image = nil
                caption = ""
            }
            .font(.system(size: 13))
            .foregroundStyle(Theme.secondaryText)
            .disabled(isUploading)

            Spacer()
        }
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
