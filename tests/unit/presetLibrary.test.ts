import { describe, expect, it } from 'vitest'
import { PresetLibrary, presetLibrary } from '@/presets/library'
import { isIdentityColor, presetCategories } from '@/presets/types'

describe('PresetLibrary', () => {
  it('loads the bundled presets', () => {
    expect(presetLibrary.presets.length).toBeGreaterThanOrEqual(18)
  })

  it('has unique preset ids', () => {
    const ids = presetLibrary.presets.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has presets in every category', () => {
    for (const { id } of presetCategories) {
      expect(presetLibrary.presetsIn(id).length, id).toBeGreaterThan(0)
    }
  })

  it('has a Clean preset that changes nothing', () => {
    const clean = presetLibrary.preset('clean')!
    expect(isIdentityColor(clean.color)).toBe(true)
    expect(clean.grain).toBeUndefined()
    expect(clean.halation).toBeUndefined()
    expect(clean.lightLeak).toBeUndefined()
    expect(clean.softness).toBe(0)
    expect(clean.flash).toBe(0)
    expect(clean.vignette).toBe(0)
    expect(clean.dateStamp).toBe(false)
  })

  it('keeps effect strengths in range', () => {
    for (const p of presetLibrary.presets) {
      const strengths = [
        p.softness,
        p.flash,
        p.vignette,
        p.grain?.intensity ?? 0,
        p.halation?.intensity ?? 0,
        p.lightLeak?.intensity ?? 0,
      ]
      for (const value of strengths) {
        expect(value, p.id).toBeGreaterThanOrEqual(0)
        expect(value, p.id).toBeLessThanOrEqual(1)
      }
      expect(p.color.fade, p.id).toBeGreaterThanOrEqual(0)
      expect(p.color.fade, p.id).toBeLessThanOrEqual(0.3)
    }
  })

  it('uses defaults for missing fields', () => {
    const library = PresetLibrary.decode({
      presets: [{ id: 'x', name: 'X', category: 'film', grain: { intensity: 0.2 } }],
    })
    const preset = library.presets[0]!
    expect(preset.inspiredBy).toBeUndefined()
    expect(isIdentityColor(preset.color)).toBe(true)
    expect(preset.grain).toEqual({ intensity: 0.2, size: 1 })
    expect(preset.dateStamp).toBe(false)
    expect(preset.lightLeak).toBeUndefined()
  })

  it('gives light leaks a warm default color', () => {
    const library = PresetLibrary.decode({
      presets: [{ id: 'x', name: 'X', category: 'disposable', lightLeak: { intensity: 0.3 } }],
    })
    expect(library.presets[0]!.lightLeak).toEqual({ intensity: 0.3, color: [1, 0.45, 0.15] })
  })

  it('rejects a curve with decreasing x', () => {
    const file = {
      presets: [
        {
          id: 'x',
          name: 'X',
          category: 'film',
          color: {
            curves: {
              master: [
                [0, 0],
                [0.6, 0.5],
                [0.4, 0.7],
                [1, 1],
              ],
            },
          },
        },
      ],
    }
    expect(() => PresetLibrary.decode(file)).toThrow(/increase/)
  })

  it('rejects an unknown category and a missing name', () => {
    expect(() =>
      PresetLibrary.decode({ presets: [{ id: 'x', name: 'X', category: 'toy' }] }),
    ).toThrow()
    expect(() => PresetLibrary.decode({ presets: [{ id: 'x', category: 'film' }] })).toThrow()
  })
})
