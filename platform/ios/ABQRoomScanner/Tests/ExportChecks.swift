import Foundation

// Tests the same Foundation encoder that the RoomPlan adapter calls. Inputs are
// synthetic measurements, not a mock RoomPlan SDK or a physical-device scan.
@main
struct ExportChecks {
    typealias E = MeasurementExport
    static let scanID = uuid(1)
    static let roomID = uuid(2)
    static let capturedAt = ISO8601DateFormatter().date(from: "2026-10-01T12:00:00Z")!

    static func uuid(_ number: Int) -> UUID {
        UUID(uuidString: String(format: "00000000-0000-4000-8000-%012d", number))!
    }

    static func wall(_ id: Int, _ width: Double = 4, _ height: Double = 2.4) -> E.Surface {
        E.Surface(identifier: uuid(id), width: width, height: height, confidence: .high)
    }

    static func opening(_ id: Int, _ width: Double = 0.9, _ height: Double = 2.1,
                        parent: UUID? = uuid(10), kind: E.OpeningKind = .door) -> E.OpeningInput {
        E.OpeningInput(surface: E.Surface(identifier: uuid(id), width: width, height: height,
                                    confidence: .medium, parentIdentifier: parent), kind: kind)
    }

    static func room(walls: [E.Surface]? = nil, openings: [E.OpeningInput]? = nil,
                     floors: [[PolygonArea.Point]]? = nil, id: UUID = roomID) -> E.RoomInput {
        E.RoomInput(identifier: id,
                    walls: walls ?? [wall(10), wall(11, 3), wall(12), wall(13, 3)],
                    openings: openings ?? [opening(20), opening(21, 1.2, 1.2, parent: uuid(12), kind: .window)],
                    floorPolygons: floors ?? [[.init(x: 0, y: 0, z: 0), .init(x: 4, y: 0, z: 0),
                                              .init(x: 4, y: 0, z: 3), .init(x: 0, y: 0, z: 3)]])
    }

    static func export(_ input: E.RoomInput, name: String = "Synthetic room", scan: UUID = scanID) throws -> E.Result {
        try E.make(room: input, name: name, scanID: scan, capturedAt: capturedAt)
    }

    static func main() throws {
        var failures: [String] = []
        var checks = 0
        func expect(_ condition: @autoclosure () -> Bool, _ label: String) {
            checks += 1
            if !condition() { failures.append(label) }
        }
        func rejects(_ label: String, _ work: () throws -> E.Result) {
            checks += 1
            do { _ = try work(); failures.append("\(label): export should fail before a rejected file is saved") }
            catch let error as LocalizedError {
                if error.errorDescription?.isEmpty != false { failures.append("\(label): missing actionable error") }
            } catch { failures.append("\(label): unexpected error \(error)") }
        }
        let baseline = try export(room())
        let object = try JSONSerialization.jsonObject(with: baseline.data) as! [String: Any]
        let exportedRoom = (object["rooms"] as! [[String: Any]])[0]
        let exportedOpenings = exportedRoom["openings"] as! [[String: Any]]
        expect(object["schema"] as? String == "abqadu.roomplan.v1", "Compatible schema")
        expect(object["captured_at"] as? String == "2026-10-01T12:00:00Z", "ISO timestamp")
        expect(exportedOpenings[0]["wall_id"] as? String == uuid(10).uuidString, "Confirmed parent preserved")
        expect(exportedOpenings.allSatisfy { $0["reaches_floor"] is NSNull }, "Unknown floor contact is explicit null")
        expect((exportedRoom["floor"] as? [String: Any])?["area_m2"] as? Double == 12, "Actual polygon area")
        let repeated = try export(room())
        expect(repeated.data == baseline.data, "Repeat export retains scan and surface identities")

        let unlinked = try export(room(openings: [opening(20, parent: uuid(99)), opening(21, parent: nil)]))
        let unlinkedObject = try JSONSerialization.jsonObject(with: unlinked.data) as! [String: Any]
        let unlinkedRoom = (unlinkedObject["rooms"] as! [[String: Any]])[0]
        expect((unlinkedRoom["openings"] as! [[String: Any]]).allSatisfy { $0["wall_id"] is NSNull }, "No guessed parent IDs")
        expect(unlinked.notes.contains { $0.contains("2 opening") }, "Unlinked opening review note")
        let noFloor = try export(room(floors: []))
        let noFloorObject = try JSONSerialization.jsonObject(with: noFloor.data) as! [String: Any]
        expect(((noFloorObject["rooms"] as! [[String: Any]])[0])["floor"] == nil, "Missing floor is omitted")

        // These guard real failures of the receiving JS importer, not just JSON validity.
        rejects("Opening wider than parent") { try export(room(openings: [opening(20, 4.1, 2)])) }
        rejects("Opening taller than parent") { try export(room(openings: [opening(20, 1, 2.5)])) }
        rejects("Combined openings exceed wall area") {
            try export(room(openings: [opening(20, 3, 2), opening(21, 3, 2)]))
        }
        rejects("Surface collides with room ID") { try export(room(walls: [wall(2)], openings: [])) }
        rejects("Room collides with scan ID") { try export(room(id: scanID)) }
        rejects("Surface collides with scan ID") { try export(room(walls: [wall(1)], openings: [])) }
        rejects("Duplicate surfaces") { try export(room(walls: [wall(10), wall(10)], openings: [])) }
        rejects("Zero dimension") { try export(room(walls: [wall(10, 0)], openings: [])) }
        rejects("Infinite dimension") { try export(room(walls: [wall(10, .infinity)], openings: [])) }
        rejects("NaN dimension") { try export(room(walls: [wall(10, .nan)], openings: [])) }
        rejects("Over 100m dimension") { try export(room(walls: [wall(10, 100.01)], openings: [])) }
        rejects("More than 200 walls") { try export(room(walls: (100...300).map { wall($0) }, openings: [])) }
        rejects("More than 400 openings") { try export(room(openings: (100...500).map { opening($0, parent: nil) })) }
        rejects("More than estimator wall quantity limit") {
            try export(room(walls: (100...299).map { wall($0, 100, 100) }, openings: []))
        }
        rejects("Blank name") { try export(room(), name: " \n ") }
        rejects("Emoji UTF-16 name limit") { try export(room(), name: String(repeating: "🏠", count: 51)) }
        let unicode = try export(room(), name: String(repeating: "🏠", count: 50))
        let limits = try export(room(walls: [wall(10, 100, 100)], openings: [opening(20, 100, 100)],
                                    floors: [[.init(x: 0, y: 0, z: 0), .init(x: 100, y: 0, z: 0),
                                              .init(x: 100, y: 0, z: 100), .init(x: 0, y: 0, z: 100)]]))
        expect(!limits.data.isEmpty, "Documented dimension/floor boundaries remain supported")

        if !failures.isEmpty {
            failures.forEach { FileHandle.standardError.write(Data("FAIL: \($0)\n".utf8)) }
            exit(1)
        }
        if CommandLine.arguments.count == 2 {
            let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            for (name, result) in [("baseline", baseline), ("unlinked", unlinked), ("no-floor", noFloor),
                                   ("unicode", unicode), ("limits", limits)] {
                try result.data.write(to: directory.appendingPathComponent("\(name).json"), options: .atomic)
            }
        }
        print("\(checks) native export checks passed.")
    }
}
