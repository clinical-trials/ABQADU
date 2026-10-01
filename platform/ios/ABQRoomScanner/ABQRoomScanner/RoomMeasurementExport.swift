import Foundation
import RoomPlan

// The Apple-specific adapter only translates measured surfaces. Validation,
// parent resolution, floor math and JSON encoding share the host-tested core.
enum RoomMeasurementExport {
    static func make(room: CapturedRoom, name: String, scanID: UUID, capturedAt: Date) throws -> MeasurementExport.Result {
        func surface(_ value: CapturedRoom.Surface) -> MeasurementExport.Surface {
            MeasurementExport.Surface(identifier: value.identifier,
                                      width: Double(value.dimensions.x), height: Double(value.dimensions.y),
                                      confidence: confidence(value.confidence), parentIdentifier: value.parentIdentifier)
        }
        let input = MeasurementExport.RoomInput(
            identifier: room.identifier,
            walls: room.walls.map(surface),
            openings: room.doors.map { .init(surface: surface($0), kind: .door) }
                + room.windows.map { .init(surface: surface($0), kind: .window) }
                + room.openings.map { .init(surface: surface($0), kind: .opening) },
            floorPolygons: room.floors.map { floor in
                floor.polygonCorners.map { .init(x: Double($0.x), y: Double($0.y), z: Double($0.z)) }
            })
        return try MeasurementExport.make(room: input, name: name, scanID: scanID, capturedAt: capturedAt)
    }

    private static func confidence(_ value: CapturedRoom.Confidence) -> MeasurementExport.Confidence {
        switch value {
        case .high: return .high
        case .medium: return .medium
        case .low: return .low
        @unknown default: return .unknown
        }
    }
}
