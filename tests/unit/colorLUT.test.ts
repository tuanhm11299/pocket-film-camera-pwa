import { describe, expect, it } from 'vitest'
import { presetLibrary } from '@/presets/library'
import { defaultColorSettings, type ColorSettings } from '@/presets/types'
import { ColorTransform } from '@/render/colorTransform'
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
