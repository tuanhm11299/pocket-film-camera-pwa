import { describe, expect, it } from 'vitest'
import { ToneCurve } from '@/render/toneCurve'

const curve = (pairs: [number, number][]) => new ToneCurve(pairs.map(([x, y]) => ({ x, y })))

describe('ToneCurve', () => {
  it('returns the input for the identity curve', () => {
    for (let x = 0; x <= 1; x += 0.05) {
      expect(ToneCurve.identity.value(x)).toBeCloseTo(x, 12)
    }
  })

  it('passes through its points', () => {
    const points: [number, number][] = [
      [0, 0],
      [0.25, 0.15],
      [0.5, 0.5],
      [0.75, 0.85],
      [1, 1],
    ]
    const c = curve(points)
    for (const [x, y] of points) expect(c.value(x)).toBeCloseTo(y, 12)
  })

  it('keeps an S-curve monotone and in range', () => {
    const c = curve([
      [0, 0],
      [0.2, 0.05],
      [0.5, 0.5],
      [0.8, 0.95],
      [1, 1],
    ])
    let previous = -Infinity
    for (let i = 0; i <= 100; i++) {
      const y = c.value(i / 100)
      expect(y).toBeGreaterThanOrEqual(previous - 1e-12)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
      previous = y
    }
  })

  it('falls back to identity with too few points', () => {
    expect(curve([[0.5, 0.2]]).equals(ToneCurve.identity)).toBe(true)
  })

  it('decodes pairs and rejects bad ones', () => {
    expect(
      ToneCurve.fromPairs([
        [0, 0.1],
        [1, 0.9],
      ]).value(0),
    ).toBe(0.1)
    expect(() => ToneCurve.fromPairs([[0, 0]])).toThrow()
    expect(() =>
      ToneCurve.fromPairs([
        [0, 0],
        [1.2, 1],
      ]),
    ).toThrow()
    expect(() =>
      ToneCurve.fromPairs([
        [0, 0],
        [0, 1],
      ]),
    ).toThrow()
  })
})
