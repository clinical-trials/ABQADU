import SwiftUI
import UIKit

struct ScannerScreen: View {
    @StateObject private var model = ScanModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var document: ScanDocument?
    @State private var showingExporter = false
    @State private var confirmRestart = false
    @State private var exportMessage = ""
    @State private var exportNotes: [String] = []

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if model.phase.showsCapture {
                    RoomCaptureContainer(model: model, scanID: model.scanID)
                        .id(model.scanID)
                        .frame(minHeight: 220, maxHeight: .infinity)
                        .overlay(alignment: .top) {
                            if model.phase == .processing {
                                ProgressView("Processing room…")
                                    .padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                                    .padding()
                            }
                        }
                    captureControls
                } else {
                    introductoryScreen
                }
            }
            .navigationTitle("ABQ Room Scanner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if [.starting, .scanning, .processing].contains(model.phase) {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel scan") { confirmRestart = true }
                    }
                }
            }
            .confirmationDialog("Discard this scan?", isPresented: $confirmRestart, titleVisibility: .visible) {
                Button("Discard scan", role: .destructive) {
                    document = nil
                    exportMessage = ""
                    exportNotes = []
                    model.cancel()
                }
            } message: {
                Text("Save the measurement file first if you want to keep it.")
            }
            .fileExporter(isPresented: $showingExporter, document: document, contentType: .json,
                          defaultFilename: "ABQ-Room-\(model.scanID.uuidString)") { result in
                switch result {
                case .success:
                    exportMessage = "Measurement file saved. Import it in the contractor cost estimator and review every quantity."
                case .failure(let error):
                    exportMessage = "File export did not finish: \(error.localizedDescription). The scan remains available; try saving again."
                }
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background { model.enteredBackground() }
            }
        }
        .tint(Color(red: 0.16, green: 0.29, blue: 0.21))
    }

    private var introductoryScreen: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Image(systemName: "viewfinder").font(.system(size: 48)).accessibilityHidden(true)
                Text("Measure the room.\nReview the work.").font(.largeTitle.bold())
                Text("Walk one indoor room with a supported LiDAR iPhone or iPad. RoomPlan guides the scan; the estimate stays yours to review.")
                switch model.phase {
                case .unsupported:
                    Label("This device does not support RoomPlan capture.", systemImage: "iphone.slash")
                    Text("Use a LiDAR-equipped iPhone Pro or iPad Pro running iOS/iPadOS 17 or newer. Scanning does not run in a browser or simulator.")
                case .denied:
                    Label("Camera access is required to scan.", systemImage: "camera")
                    Button("Open camera settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }.buttonStyle(.bordered)
                    Button("Check permission again") { model.start() }.buttonStyle(.borderedProminent)
                case .requestingPermission:
                    ProgressView("Waiting for camera permission…")
                case .failed:
                    Label(model.message, systemImage: "exclamationmark.triangle")
                    Button("Try a new scan") { model.start() }.buttonStyle(.borderedProminent)
                default:
                    Button("Start room scan") { model.start() }.buttonStyle(.borderedProminent)
                }
                Divider()
                Text("Before you start").font(.headline)
                Text("Scan one room at a time in good light. Keep the device upright, move slowly, and include corners, doors, and windows. Follow the coaching shown over the camera view.")
                Text("Measurements are estimates. Check dimensions on site before ordering or quoting. This app exports geometry only; it does not choose prices or issue invoices.")
                Text("The app makes no server requests. Scan data stays in memory until you choose where to save the JSON file. Saving to a cloud-backed Files location uses that location’s sharing settings.")
                    .font(.footnote).foregroundStyle(.secondary)
            }.padding(24).frame(maxWidth: 640)
        }.frame(maxWidth: .infinity)
    }

    private var captureControls: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                switch model.phase {
                case .starting:
                    ProgressView("Starting camera…")
                case .scanning:
                    Text("Follow RoomPlan’s instructions. Finish after scanning every wall and opening.").font(.subheadline)
                    Button("Finish room scan") { model.finish() }.buttonStyle(.borderedProminent)
                case .processing:
                    Text("Keep the app open while RoomPlan builds the final room.").font(.subheadline)
                case .review:
                    reviewControls
                default:
                    EmptyView()
                }
            }.padding().frame(maxWidth: 640)
        }
        .frame(maxHeight: model.phase == .review ? 340 : 150)
        .background(Color(.systemBackground))
    }

    private var reviewControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Review your room").font(.headline)
            Text("Drag or pinch the model to inspect it. Confirm walls and openings before exporting.").font(.subheadline)
            TextField("Room name", text: $model.roomName)
                .textFieldStyle(.roundedBorder)
                .onChange(of: model.roomName) { _, value in
                    if value.utf16.count > 100 {
                        // Keep whole graphemes while satisfying the web importer's
                        // UTF-16 string limit, including emoji and combining marks.
                        var shortened = String(value.prefix(100))
                        while shortened.utf16.count > 100 { shortened.removeLast() }
                        model.roomName = shortened
                    }
                }
            if let room = model.capturedRoom {
                Text("\(room.walls.count) walls · \(room.doors.count) doors · \(room.windows.count) windows · \(room.openings.count) other openings")
                    .font(.subheadline)
            }
            Text("Wall exports use bounding dimensions. Curves, sloped walls, missed openings, and floor shapes need manual review. Doorway floor clearance is not inferred.")
                .font(.footnote).foregroundStyle(.secondary)
            Button("Save measurement JSON to Files") { prepareExport() }
                .buttonStyle(.borderedProminent)
                .disabled(model.roomName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Scan another room") { confirmRestart = true }.buttonStyle(.bordered)
            if !exportMessage.isEmpty { Text(exportMessage).font(.footnote).accessibilityAddTraits(.updatesFrequently) }
            ForEach(exportNotes, id: \.self) { note in
                Text(note).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func prepareExport() {
        guard let room = model.capturedRoom, let date = model.capturedAt else { return }
        do {
            let result = try RoomMeasurementExport.make(room: room, name: model.roomName, scanID: model.scanID, capturedAt: date)
            document = ScanDocument(data: result.data)
            exportNotes = result.notes
            exportMessage = ""
            showingExporter = true
        } catch {
            exportNotes = []
            exportMessage = "Measurements could not be exported: \(error.localizedDescription)"
        }
    }
}
