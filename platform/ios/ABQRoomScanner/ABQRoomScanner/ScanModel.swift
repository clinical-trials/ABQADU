import AVFoundation
import Combine
import Foundation
import RoomPlan

@MainActor
final class ScanModel: ObservableObject {
    enum Phase: Equatable {
        case ready, requestingPermission, unsupported, denied, starting, scanning, processing, review, failed

        var showsCapture: Bool {
            [.starting, .scanning, .processing, .review].contains(self)
        }
    }

    @Published private(set) var phase: Phase = .ready
    @Published private(set) var scanID = UUID()
    @Published private(set) var message = ""
    @Published private(set) var capturedRoom: CapturedRoom?
    @Published private(set) var capturedAt: Date?
    @Published var roomName = "Room 1"
    weak var controller: RoomCaptureController?
    private var processingTimeout: Task<Void, Never>?

    init() {
        if !RoomCaptureSession.isSupported { phase = .unsupported }
    }

    func start() {
        guard ![.requestingPermission, .starting, .scanning, .processing].contains(phase) else { return }
        guard RoomCaptureSession.isSupported else { phase = .unsupported; return }
        processingTimeout?.cancel()
        controller?.cancel()
        controller = nil
        scanID = UUID()
        capturedRoom = nil
        capturedAt = nil
        message = ""
        let requestID = scanID
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            phase = .starting
        case .notDetermined:
            phase = .requestingPermission
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                Task { @MainActor in
                    guard let self, self.scanID == requestID, self.phase == .requestingPermission else { return }
                    self.phase = granted ? .starting : .denied
                }
            }
        case .denied, .restricted:
            phase = .denied
        @unknown default:
            phase = .denied
        }
    }

    func didStart(id: UUID) {
        guard id == scanID, phase == .starting else { return }
        phase = .scanning
    }

    func finish() {
        guard phase == .scanning else { return }
        beginProcessing(id: scanID)
        controller?.finish()
    }

    func beginProcessing(id: UUID) {
        guard id == scanID, [.starting, .scanning, .processing].contains(phase) else { return }
        phase = .processing
        guard processingTimeout == nil else { return }
        processingTimeout = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 45_000_000_000) } catch { return }
            guard let self, self.scanID == id, self.phase == .processing else { return }
            self.fail("Room processing took too long. Start a new scan and try again.", id: id)
        }
    }

    func didProcess(_ room: CapturedRoom, id: UUID) {
        guard id == scanID, [.scanning, .processing].contains(phase) else { return }
        processingTimeout?.cancel()
        processingTimeout = nil
        guard !room.walls.isEmpty else {
            fail("No walls were captured. Scan a complete room slowly, then try again.", id: id)
            return
        }
        capturedRoom = room
        capturedAt = Date()
        phase = .review
    }

    func fail(_ reason: String, id: UUID) {
        guard id == scanID, [.starting, .scanning, .processing].contains(phase) else { return }
        processingTimeout?.cancel()
        processingTimeout = nil
        controller?.cancel()
        message = reason
        phase = .failed
    }

    func cancel() {
        processingTimeout?.cancel()
        processingTimeout = nil
        controller?.cancel()
        controller = nil
        scanID = UUID() // Any queued callbacks now belong to an obsolete scan.
        capturedRoom = nil
        capturedAt = nil
        message = ""
        phase = RoomCaptureSession.isSupported ? .ready : .unsupported
    }

    func enteredBackground() {
        // Do not interrupt the permission prompt or the Files export sheet.
        guard [.starting, .scanning, .processing].contains(phase) else { return }
        fail("The scan was interrupted when the app left the foreground. Please scan the room again.", id: scanID)
    }
}
