# ABQ Room Scanner

Native iOS companion for the ABQ ADU contractor estimator. It uses Apple's real `RoomCaptureView` to capture **one indoor room**, presents RoomPlan's processed model, and lets the contractor save a measurement JSON file for review in the web estimator. There are no app accounts, API keys, server requests, automatic uploads, prices, or invoices in this companion.

**Verification status:** the project is ready to open in Xcode, but an iOS SDK build, signing, and physical-device capture have **not** been verified. This development machine has only Apple's Command Line Tools; neither `/Applications/Xcode.app` nor `/Applications/Xcode-beta.app` is installed. The production JSON encoder compiles and runs on host Swift: 26 export checks passed, and five generated exports passed the actual web importer with independently checked quantities. Swift syntax parsing, property-list/project structure validation, and 11 portable polygon geometry checks also passed. These checks do not substitute for an iOS build or device test. This source prototype is not an App Store or TestFlight release.

## Open and run

1. Use a Mac with Xcode 15 or newer and an iOS 17 or newer SDK. Open `ABQRoomScanner.xcodeproj`; the shared **ABQRoomScanner** scheme includes the complete app target. No package downloads or third-party dependencies are needed.
2. In the app target's **Signing & Capabilities**, choose your existing development team and replace `com.example.abqadu.roomscanner` with your own unique bundle identifier. Configure signing privately in Xcode; no credentials belong in this repository.
3. Connect a LiDAR-equipped iPhone Pro or iPad Pro running iOS/iPadOS 17 or newer. Select that device and enable Developer Mode if Xcode requests it. Run the app. A signing identity is necessary to install a development app on a device; no account is needed to read the source or run the portable geometry checks.
4. The app checks `RoomCaptureSession.isSupported` before creating a capture view. An unsupported device or simulator shows instructions instead of starting capture. A simulator cannot perform a LiDAR scan.

The target uses Swift 5 language mode, minimal strict-concurrency checking, and iOS 17 deployment to support `parentIdentifier`, `floors`, and `polygonCorners`. UIKit/view-model state is updated on the main actor. A real SDK build must still verify all RoomPlan and SwiftUI declarations against the installed Xcode version. The project has no distribution app icon or store metadata yet.

## Capture and use measurements

1. Tap **Start room scan**, allow camera access, and follow RoomPlan's camera coaching. Scan one room slowly in good light, including every wall, corner, door, and window.
2. Tap **Finish room scan** and keep the app in the foreground while RoomPlan postprocesses the capture. Review its interactive model and enter a short room name.
3. Tap **Save measurement JSON to Files** and choose a destination. Repeated exports of the same scan keep the same scan ID. The app does not persist a scan across termination; export it before leaving or discarding it.
4. Transfer the JSON using Files or AirDrop, then use the room-scan import in the ABQ ADU contractor cost estimator. Review the imported walls/openings and proposed quantities before applying them to a worksheet. The file supplies dimensions, not material choices, rates, an approved quote, or payment instructions. Importing a scan does not replace the contractor's quantity review.
5. Use **Scan another room** to discard the current in-memory scan and return to the start screen. Each new scan receives a new identifier.

The app exports measured geometry only: no camera photos, furniture list, point cloud, USDZ model, account identity, or server destination. A Files location may sync to its configured cloud service; the contractor chooses that location. On an iPhone, a web address beginning with `localhost` refers to the phone itself, so use the reachable deployed/local-network web app address when importing on that device.

## Export contract and measurement limits

The JSON schema is `abqadu.roomplan.v1`, `units` is `m`, and the source is `{ "kind": "apple-roomplan", "mode": "device", "app": "ABQ Room Scanner", "version": "1.0" }`. It includes a UUID `scan_id`, ISO 8601 `captured_at`, and one room with its RoomPlan UUID and name.

- Walls contain their RoomPlan UUID, `length_m` from `dimensions.x`, `height_m` from `dimensions.y`, and capture `confidence`.
- Doors, windows, and other openings contain UUID, `kind`, width/height, confidence, and `wall_id`. A parent wall ID is exported only when RoomPlan's `parentIdentifier` matches an exported wall. Otherwise `wall_id` is explicitly `null`; the importer must review its deductions.
- `reaches_floor` is always explicitly `null`. The app does not infer doorway floor contact from its category, so it cannot establish baseboard deductions.
- `floor` is optional. A floor area is exported only from exactly one valid `CapturedRoom` floor polygon, with `method: "captured-polygon"`. The calculation uses the polygon's actual local plane in 3D and supports concave simple polygons. Degenerate, nonplanar, self-intersecting, missing, or multiple floor polygons result in an omitted floor and a visible review note. There is no bounding-rectangle or ceiling-area fallback.
- Surface dimensions must be finite, positive, and no more than 100 meters. Limits are 200 walls, 400 openings, and 10,000 square meters for an exported floor. Invalid dimensions, duplicate surface IDs, or oversized scans refuse export with a rescan/manual-entry message. Room names are capped at 100 UTF-16 units without splitting a grapheme, within the web importer's limit.
- A linked opening cannot be wider or taller than its parent wall, and combined opening area cannot exceed the wall area. Scan, room, and surface identifiers must be distinct. Net wall area must fit the estimator's 1,000,000-square-foot quantity limit. These checks run before saving, so an inconsistent capture reports a rescan/manual-measurement message instead of creating a file the importer rejects.

RoomPlan's surface dimensions describe bounding boxes. Curved walls, sloped walls, overlaps, missing openings, and occlusion require review; this is not an exact net-material takeoff. Apple's confidence enum describes category certainty, not a certified dimension tolerance. Compare real device dimensions to tape measurements before relying on the quantities for purchases or a bid. No prices are inferred from geometry.

## Checks available without Xcode

From this directory, run:

```sh
swiftc -frontend -parse ABQRoomScanner/*.swift
plutil -lint ABQRoomScanner/Info.plist ABQRoomScanner.xcodeproj/project.pbxproj
swiftc -module-cache-path /private/tmp/abq-room-swift-cache \
  ABQRoomScanner/PolygonArea.swift Tests/GeometryChecks.swift \
  -o /private/tmp/abq-room-geometry-checks
/private/tmp/abq-room-geometry-checks
swiftc -swift-version 5 -module-cache-path /private/tmp/abq-room-swift-cache \
  ABQRoomScanner/PolygonArea.swift ABQRoomScanner/MeasurementExport.swift \
  Tests/ExportChecks.swift -o /private/tmp/abq-room-export-checks
/private/tmp/abq-room-export-checks /private/tmp/abq-room-export-fixtures
node Tests/ExportInteropChecks.mjs /private/tmp/abq-room-export-fixtures
```

The geometry executable checks 11 cases: XY/XZ/YZ rectangles, a concave floor, reversed/closed corners, and empty, underspecified, collinear, nonplanar, crossed, and nonfinite input. `ExportChecks.swift` exercises the same Foundation-only `MeasurementExport` encoder used by the native `RoomMeasurementExport` adapter. It tests valid metric JSON, stable IDs, explicit unknown values, omitted floor area, UTF-16 names, bounds, identifier collisions, and opening deductions. Its optional output directory contains synthetic JSON for interoperability testing; these files are not physical-device scans even though the real encoder marks its normal output `device`.

The Node check loads the actual `platform/client/src/utils/roomScan.js` parser and verifies five generated files, exact wall/floor/baseboard quantities, unknown ceiling/floor handling, and blank costs. Node is needed only for this repository interoperability check, not by the iOS app. Both Swift test files are standalone executables, not app sources or Xcode test targets. No test substitutes a fake RoomPlan SDK or claims to verify capture hardware.

With Xcode installed, this is a **pending** unsigned SDK build check (not performed here):

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ABQRoomScanner.xcodeproj -scheme ABQRoomScanner \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath /private/tmp/abq-room-derived-data \
  CODE_SIGNING_ALLOWED=NO build
```

On a supported device, verify camera denial/settings recovery; supported and unsupported states; room coaching; finish/postprocessing; empty-scan/error retry; cancel and discard; background interruption; export cancellation/failure without losing the reviewed scan; repeat export retaining IDs; and importing a real exported JSON into the web estimator. Check small-screen controls, rotation, opening-to-wall associations, floor area, and actual meter dimensions against site measurements. Complete this device pass before treating native capture as ready for contractor use.

## Apple API references

- [RoomPlan overview](https://developer.apple.com/documentation/roomplan)
- [RoomCaptureSession.isSupported](https://developer.apple.com/documentation/roomplan/roomcapturesession/issupported)
- [RoomCaptureViewDelegate postprocessing](https://developer.apple.com/documentation/roomplan/roomcaptureviewdelegate)
- [Configuration.isCoachingEnabled](https://developer.apple.com/documentation/roomplan/roomcapturesession/configuration/iscoachingenabled)
- [CapturedRoom.Surface dimensions](https://developer.apple.com/documentation/roomplan/capturedroom/surface/dimensions)
- [Surface.parentIdentifier](https://developer.apple.com/documentation/roomplan/capturedroom/surface/parentidentifier)
- [Surface.polygonCorners](https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners)
- [CapturedRoom.Confidence](https://developer.apple.com/documentation/roomplan/capturedroom/confidence)

These official references were consulted for the capability check, guided view, postprocessed-room delegate flow, and iOS 17 surface/floor APIs. Actual SDK compilation and device behavior remain the verification steps described above.

## Additional LiDAR references evaluated

Reviewed October 1, 2026. These projects are research references, not dependencies of this companion:

- [RobotecGPULidar](https://github.com/RobotecAI/RobotecGPULidar) simulates LiDAR sensors using NVIDIA GPUs on Windows/Linux. Its potential future role is testing with synthetic scans; it does not supply iPhone room capture.
- [NVIDIA Lidar AI Solution](https://github.com/NVIDIA-AI-IOT/Lidar_AI_Solution) provides GPU perception pipelines aimed at autonomous driving. Its [cuPCL tools](https://github.com/NVIDIA-AI-IOT/cuPCL) could support future server-side point-cloud filtering, alignment, and plane segmentation. That would require a separate NVIDIA-backed processing service and a building-specific workflow.

Based on their documented scope, neither is needed for the current RoomPlan measurement handoff. The next implementation milestone remains an iOS SDK build and physical-device measurement validation of this native companion.
