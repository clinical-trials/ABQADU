import Foundation

// This production core also runs on host Swift so the exported JSON contract
// can be checked without substituting a fake RoomPlan framework.
enum MeasurementExport {
    enum Confidence: String { case high, medium, low, unknown }
    enum OpeningKind: String { case door, window, opening }
    struct Surface {
        let identifier: UUID
        let width: Double
        let height: Double
        let confidence: Confidence
        var parentIdentifier: UUID? = nil
    }
    struct OpeningInput {
        let surface: Surface
        let kind: OpeningKind
    }
    struct RoomInput {
        let identifier: UUID
        let walls: [Surface]
        let openings: [OpeningInput]
        let floorPolygons: [[PolygonArea.Point]]
    }
    struct Result {
        let data: Data
        let notes: [String]
    }

    enum ExportError: LocalizedError {
        case missingName, invalidDimensions, missingWalls, duplicateSurface, tooManySurfaces, excessiveFloorArea
        case openingExceedsWall, combinedOpeningsExceedWall, excessiveWallQuantity
        var errorDescription: String? {
            switch self {
            case .missingName: return "Give this room a shorter name (up to 100 text units, including emoji)."
            case .invalidDimensions: return "A surface dimension is missing, invalid, or over 100 meters. Rescan this single room or use manual measurements."
            case .missingWalls: return "No measured walls were captured."
            case .duplicateSurface: return "The scan has duplicate surface identifiers. Please rescan the room."
            case .tooManySurfaces: return "This scan exceeds 200 walls or 400 openings. Scan one smaller room at a time."
            case .excessiveFloorArea: return "The captured floor exceeds 10,000 square meters. Rescan this single room or enter its area manually."
            case .openingExceedsWall: return "An opening is wider or taller than its parent wall. Review the scan and rescan the room, or use manual measurements."
            case .combinedOpeningsExceedWall: return "The captured openings total more area than their parent wall. Check for overlapping or duplicated openings, then rescan or use manual measurements."
            case .excessiveWallQuantity: return "The captured wall quantity exceeds the estimator limit. Scan a smaller room or enter separately measured sections manually."
            }
        }
    }

    private struct Envelope: Encodable {
        let schema = "abqadu.roomplan.v1"
        let scan_id: String
        let captured_at: String
        let source = Source()
        let units = "m"
        let rooms: [Room]
    }
    private struct Source: Encodable {
        let kind = "apple-roomplan"
        let mode = "device"
        let app = "ABQ Room Scanner"
        let version = "1.0"
    }
    private struct Room: Encodable {
        let id: String
        let name: String
        let walls: [Wall]
        let openings: [Opening]
        let floor: Floor?
    }
    private struct Wall: Encodable {
        let id: String
        let length_m: Double
        let height_m: Double
        let confidence: String
    }
    private struct Opening: Encodable {
        let id: String
        let wall_id: String?
        let kind: String
        let width_m: Double
        let height_m: Double
        let reaches_floor: Bool? = nil
        let confidence: String

        enum CodingKeys: String, CodingKey { case id, wall_id, kind, width_m, height_m, reaches_floor, confidence }
        func encode(to encoder: Encoder) throws {
            var values = encoder.container(keyedBy: CodingKeys.self)
            try values.encode(id, forKey: .id)
            // Explicit null means unconfirmed; absence or false must not imply a
            // doorway touches the floor or belongs to a guessed wall.
            if let wall_id { try values.encode(wall_id, forKey: .wall_id) } else { try values.encodeNil(forKey: .wall_id) }
            try values.encode(kind, forKey: .kind)
            try values.encode(width_m, forKey: .width_m)
            try values.encode(height_m, forKey: .height_m)
            try values.encodeNil(forKey: .reaches_floor)
            try values.encode(confidence, forKey: .confidence)
        }
    }
    private struct Floor: Encodable {
        let area_m2: Double
        let method = "captured-polygon"
    }

    static func make(room: RoomInput, name: String, scanID: UUID, capturedAt: Date) throws -> Result {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.utf16.count <= 100 else { throw ExportError.missingName }
        guard !room.walls.isEmpty else { throw ExportError.missingWalls }
        guard room.walls.count <= 200,
              room.openings.count <= 400 else {
            throw ExportError.tooManySurfaces
        }
        var identifiers = Set([scanID])
        guard identifiers.insert(room.identifier).inserted else { throw ExportError.duplicateSurface }
        func register(_ surface: Surface) throws {
            guard identifiers.insert(surface.identifier).inserted else { throw ExportError.duplicateSurface }
            guard surface.width.isFinite, surface.height.isFinite,
                  surface.width > 0, surface.height > 0,
                  surface.width <= 100, surface.height <= 100 else { throw ExportError.invalidDimensions }
        }
        let walls = try room.walls.map { surface -> Wall in
            try register(surface)
            return Wall(id: surface.identifier.uuidString, length_m: Double(surface.width),
                        height_m: Double(surface.height), confidence: surface.confidence.rawValue)
        }
        let wallIDs = Set(room.walls.map(\.identifier))
        var missingParents = 0
        func opening(_ surface: Surface, kind: String) throws -> Opening {
            try register(surface)
            let parent = surface.parentIdentifier.flatMap { wallIDs.contains($0) ? $0.uuidString : nil }
            if parent == nil { missingParents += 1 }
            return Opening(id: surface.identifier.uuidString, wall_id: parent, kind: kind,
                           width_m: Double(surface.width), height_m: Double(surface.height),
                           confidence: surface.confidence.rawValue)
        }
        let openings = try room.openings.map { try opening($0.surface, kind: $0.kind.rawValue) }
        // Match the receiving estimator's containment and combined-area rules.
        // A structurally valid JSON file must also be importable.
        var netWallArea = 0.0
        for wall in walls {
            let children = openings.filter { $0.wall_id == wall.id }
            guard children.allSatisfy({ $0.width_m <= wall.length_m + 1e-8 && $0.height_m <= wall.height_m + 1e-8 }) else {
                throw ExportError.openingExceedsWall
            }
            let gross = wall.length_m * wall.height_m
            let deduction = children.reduce(0) { $0 + $1.width_m * $1.height_m }
            guard deduction <= gross + 1e-8 else { throw ExportError.combinedOpeningsExceedWall }
            netWallArea += max(0, gross - deduction)
        }
        guard netWallArea <= 1_000_000 * 0.3048 * 0.3048 else { throw ExportError.excessiveWallQuantity }
        var notes = ["Review captured dimensions and opening deductions in the web estimator."]
        if missingParents > 0 { notes.append("\(missingParents) opening(s) have no confirmed parent wall; deductions need manual review.") }
        // A single valid detected floor polygon can establish area. Multiple
        // floor fragments need overlap/coverage review, so v1 deliberately omits
        // floor area in that case instead of summing or using a bounding box.
        let area: Double? = room.floorPolygons.count == 1 ? PolygonArea.squareMeters(room.floorPolygons[0]) : nil
        if let area, area > 10_000 { throw ExportError.excessiveFloorArea }
        let floor = area.map { Floor(area_m2: $0) }
        if floor == nil { notes.append("Floor area was not exported: a single valid captured floor polygon was unavailable.") }
        let envelope = Envelope(scan_id: scanID.uuidString,
                                captured_at: ISO8601DateFormatter().string(from: capturedAt),
                                rooms: [Room(id: room.identifier.uuidString, name: name, walls: walls, openings: openings, floor: floor)])
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return Result(data: try encoder.encode(envelope), notes: notes)
    }

}
