import RoomPlan
import SwiftUI
import UIKit

struct RoomCaptureContainer: UIViewControllerRepresentable {
    let model: ScanModel
    let scanID: UUID

    func makeUIViewController(context: Context) -> RoomCaptureController {
        let controller = RoomCaptureController(model: model, scanID: scanID)
        model.controller = controller
        return controller
    }

    func updateUIViewController(_ uiViewController: RoomCaptureController, context: Context) {}

    static func dismantleUIViewController(_ uiViewController: RoomCaptureController, coordinator: ()) {
        uiViewController.cancel()
    }
}

final class RoomCaptureController: UIViewController, RoomCaptureViewDelegate {
    private weak var model: ScanModel?
    private let scanID: UUID
    private var captureView: RoomCaptureView?
    private var started = false
    private var stopped = false

    init(model: ScanModel, scanID: UUID) {
        self.model = model
        self.scanID = scanID
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("Use init(model:scanID:)") }

    override func loadView() {
        let capture = RoomCaptureView(frame: .zero)
        capture.delegate = self
        // Keep RoomCaptureView's own session delegate, coaching and 3D preview.
        captureView = capture
        view = capture
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started, !stopped, model?.scanID == scanID else { return }
        started = true
        var configuration = RoomCaptureSession.Configuration()
        configuration.isCoachingEnabled = true
        captureView?.captureSession.run(configuration: configuration)
        model?.didStart(id: scanID)
    }

    func finish() {
        guard started, !stopped else { return }
        // The view delegate receives raw data followed by a processed CapturedRoom.
        captureView?.captureSession.stop()
    }

    func cancel() {
        guard !stopped else { return }
        stopped = true
        captureView?.delegate = nil
        captureView?.captureSession.stop()
    }

    nonisolated func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        if let error {
            let reason = error.localizedDescription
            Task { @MainActor [weak self] in
                guard let self, !self.stopped else { return }
                self.model?.fail("Scan could not finish: \(reason)", id: self.scanID)
            }
            return false
        }
        Task { @MainActor [weak self] in
            guard let self, !self.stopped else { return }
            self.model?.beginProcessing(id: self.scanID)
        }
        return true
    }

    nonisolated func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        let reason = error?.localizedDescription
        Task { @MainActor [weak self] in
            guard let self, !self.stopped else { return }
            if let reason {
                self.model?.fail("Room processing failed: \(reason)", id: self.scanID)
            } else {
                self.model?.didProcess(processedResult, id: self.scanID)
            }
        }
    }
}
