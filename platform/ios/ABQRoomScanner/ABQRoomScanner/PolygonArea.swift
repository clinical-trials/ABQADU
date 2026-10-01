import Foundation

enum PolygonArea {
    struct Point {
        let x: Double
        let y: Double
        let z: Double
    }

    static func squareMeters(_ vertices: [Point]) -> Double? {
        guard vertices.count >= 3, vertices.count <= 1_000,
              vertices.allSatisfy({ [$0.x, $0.y, $0.z].allSatisfy { $0.isFinite && abs($0) <= 1_000_000 } }) else { return nil }
        var points = vertices
        func same(_ a: Point, _ b: Point) -> Bool {
            abs(a.x - b.x) < 1e-9 && abs(a.y - b.y) < 1e-9 && abs(a.z - b.z) < 1e-9
        }
        if same(points[0], points[points.count - 1]) { points.removeLast() }
        guard points.count >= 3 else { return nil }
        for i in points.indices {
            for j in points.indices where j > i {
                if same(points[i], points[j]) { return nil }
            }
        }

        // Newell's area vector works in any local plane, including concave
        // polygons, without assuming that a floor uses x/z or x/y coordinates.
        var nx = 0.0, ny = 0.0, nz = 0.0
        for i in points.indices {
            let p = points[i], q = points[(i + 1) % points.count]
            nx += (p.y - q.y) * (p.z + q.z)
            ny += (p.z - q.z) * (p.x + q.x)
            nz += (p.x - q.x) * (p.y + q.y)
        }
        let magnitude = sqrt(nx * nx + ny * ny + nz * nz)
        guard magnitude.isFinite, magnitude > 1e-8 else { return nil }
        let origin = points[0]
        guard points.allSatisfy({
            abs(($0.x - origin.x) * nx + ($0.y - origin.y) * ny + ($0.z - origin.z) * nz) / magnitude <= 0.001
        }) else { return nil }

        // Reject self-intersections before using a polygon as a floor area.
        typealias P2 = (x: Double, y: Double)
        let projected: [P2] = points.map { point in
            if abs(nx) >= abs(ny) && abs(nx) >= abs(nz) { return (point.y, point.z) }
            if abs(ny) >= abs(nz) { return (point.x, point.z) }
            return (point.x, point.y)
        }
        func cross(_ a: P2, _ b: P2, _ c: P2) -> Double {
            (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
        }
        func onSegment(_ a: P2, _ b: P2, _ p: P2) -> Bool {
            abs(cross(a, b, p)) < 1e-10 && p.x >= min(a.x, b.x) - 1e-10 && p.x <= max(a.x, b.x) + 1e-10
                && p.y >= min(a.y, b.y) - 1e-10 && p.y <= max(a.y, b.y) + 1e-10
        }
        func intersects(_ a: P2, _ b: P2, _ c: P2, _ d: P2) -> Bool {
            let c1 = cross(a, b, c), c2 = cross(a, b, d), c3 = cross(c, d, a), c4 = cross(c, d, b)
            return (c1 * c2 < 0 && c3 * c4 < 0) || onSegment(a, b, c) || onSegment(a, b, d)
                || onSegment(c, d, a) || onSegment(c, d, b)
        }
        for i in projected.indices {
            for j in projected.indices where j > i {
                let nextI = (i + 1) % projected.count, nextJ = (j + 1) % projected.count
                if nextI == j || nextJ == i { continue }
                if intersects(projected[i], projected[nextI], projected[j], projected[nextJ]) { return nil }
            }
        }
        return magnitude / 2
    }
}
