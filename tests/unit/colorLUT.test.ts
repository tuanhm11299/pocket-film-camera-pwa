import { describe, expect, it } from 'vitest'
import { presetLibrary } from '@/presets/library'
import { defaultColorSettings, isIdentityColor, type ColorSettings } from '@/presets/types'
import { ColorTransform, filmCurveValue, hueAndChroma } from '@/render/colorTransform'
import { cubeData, defaultLUTDimension } from '@/render/lut'
import { ToneCurve } from '@/render/toneCurve'

const settings = (overrides: Partial<ColorSettings>): ColorSettings => ({
  ...defaultColorSettings(),
  ...overrides,
})

describe('cubeData', () => {
  it('has the expected size', () => {
    const n = defaultLUTDimension
    expect(cubeData(defaultColorSettings()).length).toBe(n * n * n * 4)
  })

  it('gives an identity cube for default settings', () => {
    const n = 9
    const values = cubeData(defaultColorSettings(), n)
    let i = 0
    for (let b = 0; b < n; b++) {
      for (let g = 0; g < n; g++) {
        for (let r = 0; r < n; r++) {
          expect(values[i]).toBeCloseTo(r / (n - 1), 5)
          expect(values[i + 1]).toBeCloseTo(g / (n - 1), 5)
          expect(values[i + 2]).toBeCloseTo(b / (n - 1), 5)
          expect(values[i + 3]).toBe(1)
          i += 4
        }
      }
    }
  })

  it('has no color in a monochrome cube', () => {
    const values = cubeData(settings({ monochrome: true, contrast: 0.3 }), 9)
    for (let i = 0; i < values.length; i += 4) {
      expect(values[i]).toBeCloseTo(values[i + 1]!, 6)
      expect(values[i + 1]).toBeCloseTo(values[i + 2]!, 6)
    }
  })

  it('stays in range for every preset', () => {
    for (const preset of presetLibrary.presets) {
      for (const value of cubeData(preset.color, 9)) {
        expect(value, preset.id).toBeGreaterThanOrEqual(0)
        expect(value, preset.id).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is deterministic', () => {
    const s = settings({
      saturation: 1.3,
      curves: {
        master: new ToneCurve([
          { x: 0, y: 0.05 },
          { x: 1, y: 0.95 },
        ]),
      },
    })
    expect(cubeData(s)).toEqual(cubeData(s))
  })
})

describe('ColorTransform', () => {
  it('makes gray warmer with a warm temperature', () => {
    const out = new ColorTransform(settings({ temperature: 0.5 })).apply([0.5, 0.5, 0.5])
    expect(out[0]).toBeGreaterThan(out[2])
  })

  it('brightens with positive exposure', () => {
    const out = new ColorTransform(settings({ exposure: 1 })).apply([0.4, 0.4, 0.4])
    expect(out[1]).toBeGreaterThan(0.5)
  })

  it('keeps whites below clipping with highlight rolloff', () => {
    const out = new ColorTransform(settings({ highlightRolloff: 1 })).apply([0.9, 0.9, 0.9])
    expect(out[0]).toBeLessThan(0.9)
    expect(out[0]).toBeGreaterThan(0.7)
  })

  it('lifts blacks with fade', () => {
    const out = new ColorTransform(settings({ fade: 0.1 })).apply([0, 0, 0])
    expect(out[0]).toBeCloseTo(0.1, 6)
  })
})

describe('film color stages', () => {
  const grays = [0, 0.1, 0.25, 0.46, 0.6, 0.8, 1]
  const luma = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!

  it('treats an identity matrix as no change', () => {
    const t = new ColorTransform(settings({ matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] }))
    const out = t.apply([0.3, 0.6, 0.9])
    expect(out[0]).toBeCloseTo(0.3, 6)
    expect(out[1]).toBeCloseTo(0.6, 6)
    expect(out[2]).toBeCloseTo(0.9, 6)
  })

  it('swaps channels with a matrix', () => {
    const t = new ColorTransform(settings({ matrix: [0, 0, 1, 0, 1, 0, 1, 0, 0] }))
    const out = t.apply([0.9, 0.5, 0.1])
    expect(out[0]).toBeCloseTo(0.1, 6)
    expect(out[2]).toBeCloseTo(0.9, 6)
  })

  it('has monotone film curves that keep black, mid-gray and white', () => {
    for (const toe of [0, 0.5, 1]) {
      for (const shoulder of [0, 0.5, 1]) {
        for (const contrast of [0.25, 0.7, 1, 1.4, 2]) {
          const curve = { contrast, toe, shoulder, channelContrast: [1, 1, 1] as const }
          let last = -1
          for (let x = 0; x <= 1.0001; x += 0.01) {
            const y = filmCurveValue(curve, 0, x)
            expect(y, `${contrast} ${toe} ${shoulder} at ${x}`).toBeGreaterThanOrEqual(last)
            last = y
          }
          expect(filmCurveValue(curve, 0, 0)).toBeCloseTo(0, 9)
          expect(filmCurveValue(curve, 0, 0.46)).toBeCloseTo(0.46, 9)
          expect(filmCurveValue(curve, 0, 1)).toBeCloseTo(1, 9)
        }
      }
    }
  })

  it('makes a contrasty film curve darken shadows and brighten highlights', () => {
    const curve = { contrast: 1.5, toe: 0.5, shoulder: 0.5, channelContrast: [1, 1, 1] as const }
    expect(filmCurveValue(curve, 0, 0.2)).toBeLessThan(0.2)
    expect(filmCurveValue(curve, 0, 0.7)).toBeGreaterThan(0.7)
  })

  it('gives color crossover with different contrast per channel', () => {
    const t = new ColorTransform(
      settings({
        filmCurve: { contrast: 1.2, toe: 0.5, shoulder: 0.5, channelContrast: [1, 1, 0.8] },
      }),
    )
    const shadow = t.apply([0.2, 0.2, 0.2])
    const highlight = t.apply([0.8, 0.8, 0.8])
    expect(shadow[2]).toBeGreaterThan(shadow[0])
    expect(highlight[2]).toBeLessThan(highlight[0])
  })

  it('never changes neutrals with hue bands', () => {
    const band = { hue: 40, sat: 0.8, lum: 0.8 }
    const t = new ColorTransform(
      settings({ hue: { red: band, yellow: band, green: band, blue: band, magenta: band } }),
    )
    for (const v of grays) {
      const out = t.apply([v, v, v])
      for (const x of out) expect(x).toBeCloseTo(v, 6)
    }
  })

  it('lightens yellows without touching blues', () => {
    const t = new ColorTransform(settings({ hue: { yellow: { hue: 0, sat: 0, lum: 0.6 } } }))
    const yellow: [number, number, number] = [0.8, 0.7, 0.1]
    const blue: [number, number, number] = [0.1, 0.2, 0.8]
    expect(luma(t.apply(yellow))).toBeGreaterThan(luma(yellow) + 0.05)
    const outBlue = t.apply(blue)
    outBlue.forEach((x, i) => expect(x).toBeCloseTo(blue[i]!, 6))
  })

  it('shifts hues toward the next color on the wheel', () => {
    const t = new ColorTransform(settings({ hue: { blue: { hue: -30, sat: 0, lum: 0 } } }))
    const before = hueAndChroma([0.1, 0.3, 0.9]).hue
    const after = hueAndChroma(t.apply([0.1, 0.3, 0.9])).hue
    expect(after).toBeLessThan(before - 15)
  })

  it('takes color out of the shadows only', () => {
    const t = new ColorTransform(settings({ shadowSaturation: 0 }))
    const dark = t.apply([0.15, 0.05, 0.05])
    const bright = t.apply([0.9, 0.7, 0.7])
    expect(dark[0] - dark[2]).toBeLessThan(0.02)
    expect(bright[0] - bright[2]).toBeCloseTo(0.2, 2)
  })

  it('bleaches nearly clipped colors to white', () => {
    const t = new ColorTransform(settings({ clip: 1 }))
    const out = t.apply([1, 0.9, 0.6])
    expect(out[2]).toBeGreaterThan(0.95)
    const mid = t.apply([0.5, 0.3, 0.2])
    expect(mid[2]).toBeCloseTo(0.2, 6)
  })

  it('treats new fields at their defaults as identity', () => {
    expect(isIdentityColor(defaultColorSettings())).toBe(true)
    expect(isIdentityColor(settings({ clip: 0.1 }))).toBe(false)
    expect(isIdentityColor(settings({ hue: { red: { hue: 1, sat: 0, lum: 0 } } }))).toBe(false)
    expect(
      isIdentityColor(
        settings({ filmCurve: { contrast: 1, toe: 0, shoulder: 0, channelContrast: [1, 1, 1] } }),
      ),
    ).toBe(false)
  })
})
