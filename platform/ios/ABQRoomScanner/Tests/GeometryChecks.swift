import Foundation

@main
struct GeometryChecks {
    typealias P = PolygonArea.Point

    static func main() {
        func expect(_ points: [P], _ expected: Double?, _ name: String) {
            let actual = PolygonArea.squareMeters(points)
            if let expected {
                precondition(actual != nil && abs(actual! - expected) < 0.00000001, "\(name): expected \(expected), got \(String(describing: actual))")
            } else {
                precondition(actual == nil, "\(name): malformed polygon should be omitted")
            }
        }
        expect([P(x: 0, y: 0, z: 0), P(x: 4, y: 0, z: 0), P(x: 4, y: 3, z: 0), P(x: 0, y: 3, z: 0)], 12, "XY floor")
        expect([P(x: 0, y: 0, z: 0), P(x: 4, y: 0, z: 0), P(x: 4, y: 0, z: 3), P(x: 0, y: 0, z: 3)], 12, "XZ floor")
        expect([P(x: 7, y: 0, z: 0), P(x: 7, y: 4, z: 0), P(x: 7, y: 4, z: 3), P(x: 7, y: 0, z: 3)], 12, "YZ floor")
        expect([P(x: 0, y: 0, z: 0), P(x: 4, y: 0, z: 0), P(x: 4, y: 1, z: 0), P(x: 1, y: 1, z: 0), P(x: 1, y: 3, z: 0), P(x: 0, y: 3, z: 0)], 6, "Concave L floor")
        expect([P(x: 0, y: 0, z: 0), P(x: 0, y: 3, z: 0), P(x: 4, y: 3, z: 0), P(x: 4, y: 0, z: 0), P(x: 0, y: 0, z: 0)], 12, "Reversed closed floor")
        expect([], nil, "No floor")
        expect([P(x: 0, y: 0, z: 0), P(x: 1, y: 0, z: 0)], nil, "Missing corner")
        expect([P(x: 0, y: 0, z: 0), P(x: 1, y: 0, z: 0), P(x: 2, y: 0, z: 0)], nil, "Collinear")
        expect([P(x: 0, y: 0, z: 0), P(x: 4, y: 0, z: 0), P(x: 4, y: 3, z: 1), P(x: 0, y: 3, z: 0)], nil, "Nonplanar")
        expect([P(x: 0, y: 0, z: 0), P(x: 4, y: 3, z: 0), P(x: 0, y: 3, z: 0), P(x: 4, y: 0, z: 0)], nil, "Crossed edges")
        expect([P(x: .nan, y: 0, z: 0), P(x: 1, y: 0, z: 0), P(x: 0, y: 1, z: 0)], nil, "Invalid coordinate")
        print("11 polygon geometry checks passed.")
    }
}
