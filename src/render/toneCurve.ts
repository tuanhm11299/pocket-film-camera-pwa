export interface CurvePoint {
  x: number
  y: number
}

/**
 * A smooth tone curve through control points in 0...1.
 *
 * Uses monotone cubic interpolation (Fritsch–Carlson), so the curve never
 * overshoots between points the way a plain spline can.
 */
export class ToneCurve {
  static readonly identity = new ToneCurve([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ])

  readonly points: readonly CurvePoint[]
  private readonly tangents: number[]

  /**
   * Points are sorted by `x`; points with a repeated `x` are dropped.
   * Fewer than two points gives the identity curve.
   */
  constructor(points: readonly CurvePoint[]) {
    let cleaned: CurvePoint[] = []
    for (const point of [...points].sort((a, b) => a.x - b.x)) {
      const last = cleaned[cleaned.length - 1]
      if (!last || point.x > last.x) cleaned.push({ x: point.x, y: point.y })
    }
    if (cleaned.length < 2) {
      cleaned = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]
    }
    this.points = cleaned
    this.tangents = monotoneTangents(cleaned)
  }

  /** Decodes `[[x, y], ...]`, rejecting what `Presets.json` must not contain. */
  static fromPairs(pairs: unknown): ToneCurve {
    if (!Array.isArray(pairs) || pairs.length < 2) {
      throw new Error('A tone curve needs at least two points')
    }
    const points: CurvePoint[] = []
    for (const pair of pairs) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !pair.every((v) => typeof v === 'number' && v >= 0 && v <= 1)
      ) {
        throw new Error('Curve points must be [x, y] pairs in 0...1')
      }
      const last = points[points.length - 1]
      if (last && pair[0] <= last.x) {
        throw new Error('Curve x values must increase')
      }
      points.push({ x: pair[0], y: pair[1] })
    }
    return new ToneCurve(points)
  }

  value(x: number): number {
    const p = this.points
    const first = p[0]!
    const last = p[p.length - 1]!
    if (x <= first.x) return first.y
    if (x >= last.x) return last.y

    let k = 0
    while (k < p.length - 2 && x > p[k + 1]!.x) k++
    const p0 = p[k]!
    const p1 = p[k + 1]!
    const h = p1.x - p0.x
    const t = (x - p0.x) / h
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * p0.y +
      (t3 - 2 * t2 + t) * h * this.tangents[k]! +
      (-2 * t3 + 3 * t2) * p1.y +
      (t3 - t2) * h * this.tangents[k + 1]!
    )
  }

  equals(other: ToneCurve): boolean {
    return (
      this.points.length === other.points.length &&
      this.points.every((p, i) => p.x === other.points[i]!.x && p.y === other.points[i]!.y)
    )
  }
}

function monotoneTangents(p: CurvePoint[]): number[] {
  const n = p.length
  const slopes: number[] = []
  for (let k = 0; k < n - 1; k++) {
    slopes.push((p[k + 1]!.y - p[k]!.y) / (p[k + 1]!.x - p[k]!.x))
  }

  const m = new Array<number>(n).fill(0)
  m[0] = slopes[0]!
  m[n - 1] = slopes[n - 2]!
  for (let k = 1; k < n - 1; k++) {
    const a = slopes[k - 1]!
    const b = slopes[k]!
    m[k] = a * b <= 0 ? 0 : (a + b) / 2
  }

  for (let k = 0; k < n - 1; k++) {
    const slope = slopes[k]!
    if (slope === 0) {
      m[k] = 0
      m[k + 1] = 0
      continue
    }
    const a = m[k]! / slope
    const b = m[k + 1]! / slope
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[k] = t * a * slope
      m[k + 1] = t * b * slope
    }
  }
  return m
}
