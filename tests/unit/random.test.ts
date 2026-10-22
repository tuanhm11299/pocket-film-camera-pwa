import { describe, expect, it } from 'vitest'
import { SplitMix64 } from '@/render/splitmix64'
import { dateStampText } from '@/render/renderOptions'

describe('SplitMix64', () => {
  it('matches the reference sequence', () => {
    // First outputs for seed 0 from the reference implementation.
    const rng = new SplitMix64(0n)
    expect(rng.next()).toBe(0xe220a8397b1dcdafn)
    expect(rng.next()).toBe(0x6e789e6aa1b965f4n)
    expect(rng.next()).toBe(0x06c45d188009454fn)
  })

  it('gives the same values for the same seed', () => {
    const a = new SplitMix64(42n)
    const b = new SplitMix64(42n)
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next())
  })

  it('keeps helpers in range', () => {
    const rng = new SplitMix64(7n)
    for (let i = 0; i < 1000; i++) {
      const n = rng.nextInt(512)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(512)
      const d = rng.nextDouble(0.2, 0.8)
      expect(d).toBeGreaterThanOrEqual(0.2)
      expect(d).toBeLessThanOrEqual(0.8)
    }
  })

  it('wraps negative and oversized seeds to 64 bits', () => {
    expect(new SplitMix64(-1n).next()).toBe(new SplitMix64((1n << 64n) - 1n).next())
  })
})

describe('dateStampText', () => {
  it('formats like a point-and-shoot imprint', () => {
    expect(dateStampText(new Date(1998, 9, 12))).toBe("'98 10 12")
    expect(dateStampText(new Date(2005, 0, 3))).toBe("'05 1 3")
  })
})
