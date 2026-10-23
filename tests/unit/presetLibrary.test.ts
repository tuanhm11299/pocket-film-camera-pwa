import { describe, expect, it } from 'vitest'
import { CameraLibrary, cameraLibrary, decodePreset, validChoice } from '@/presets/library'
import { frameStyles, isIdentityColor, presetCategories } from '@/presets/types'

/** Decodes a single look, the way a camera's `look` is decoded. */
const look = (fields: Record<string, unknown>) =>
  decodePreset({ id: 'x', name: 'X', category: 'film135', ...fields })

const library = (cameras: unknown[], aliases?: Record<string, string>) =>
  CameraLibrary.decode({ cameras, aliases })

describe('CameraLibrary', () => {
  it('loads the bundled cameras', () => {
    expect(cameraLibrary.cameras.length).toBeGreaterThanOrEqual(20)
    expect(cameraLibrary.looks.length).toBeGreaterThan(cameraLibrary.cameras.length)
  })

  it('has unique look ids', () => {
    const ids = cameraLibrary.looks.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has cameras in every category', () => {
    for (const { id } of presetCategories) {
      expect(cameraLibrary.camerasIn(id).length, id).toBeGreaterThan(0)
    }
  })

  it('has a Clean camera that changes nothing', () => {
    const clean = cameraLibrary.look('clean')!
    expect(isIdentityColor(clean.color)).toBe(true)
    expect(clean.grain).toBeUndefined()
    expect(clean.halation).toBeUndefined()
    expect(clean.bloom).toBeUndefined()
    expect(clean.lightLeak).toBeUndefined()
    expect(clean.softness).toBe(0)
    expect(clean.lens).toEqual({ distortion: 0, chromaticAberration: 0, edgeBlur: 0, blur: 0 })
    expect(clean.flash).toBe(0)
    expect(clean.vignette).toBe(0)
    expect(clean.dateStamp).toBe(false)
    expect(clean.aspect).toBeUndefined()
    expect(clean.frame).toBeUndefined()
  })

  it('keeps effect strengths in range', () => {
    for (const camera of cameraLibrary.cameras) {
      for (const { look: p } of camera.profiles) {
        const strengths = [
          p.softness,
          p.flash,
          p.vignette,
          p.grain?.intensity ?? 0,
          p.grain?.chroma ?? 0,
          p.grain?.roughness ?? 0,
          p.halation?.intensity ?? 0,
          p.bloom?.intensity ?? 0,
          p.lightLeak?.intensity ?? 0,
          p.lightLeak?.chance ?? 0,
          Math.abs(p.lens.distortion),
          p.lens.chromaticAberration,
          p.lens.edgeBlur,
          p.lens.blur,
          p.color.clip,
        ]
        for (const value of strengths) {
          expect(value, p.id).toBeGreaterThanOrEqual(0)
          expect(value, p.id).toBeLessThanOrEqual(1)
        }
        expect(p.color.fade, p.id).toBeGreaterThanOrEqual(0)
        expect(p.color.fade, p.id).toBeLessThanOrEqual(0.3)
        const contrast = p.color.filmCurve?.contrast ?? 1
        expect(contrast, p.id).toBeGreaterThan(0.25)
        expect(contrast, p.id).toBeLessThanOrEqual(2)
      }
    }
  })

  it('names a look after its camera and profile', () => {
    const slr = cameraLibrary.camera('slr-35')!
    expect(slr.profiles.length).toBeGreaterThan(1)
    const gold = cameraLibrary.look('slr-35/gold')!
    expect(gold.name).toBe('SLR 35 · Gold 200')
    expect(gold.inspiredBy).toBe('Kodak Gold 200')
    expect(cameraLibrary.look('holga')!.name).toBe('Holga')
  })

  it('finds old preset ids', () => {
    expect(cameraLibrary.look('gold-200')!.id).toBe('slr-35/gold')
    expect(cameraLibrary.look('grit-400')!.id).toBe('mono-35/trix')
    expect(cameraLibrary.look('fun-flash')!.id).toBe('fun-flash/default')
    expect(cameraLibrary.look('nope')).toBeUndefined()
    expect(cameraLibrary.look('slr-35/nope')).toBeUndefined()
  })

  it('merges a profile over its camera', () => {
    const lib = library([
      {
        id: 'cam',
        name: 'Cam',
        category: 'film135',
        look: { aspect: [2, 3], color: { saturation: 1.2, fade: 0.05 }, grain: { intensity: 0.3 } },
        profiles: [
          { id: 'a', name: 'A', look: { color: { saturation: 0.8 } } },
          { id: 'b', name: 'B', look: { grain: { size: 2 } } },
        ],
      },
    ])
    const [a, b] = lib.cameras[0]!.profiles.map((p) => p.look)
    expect(a!.color.saturation).toBe(0.8)
    expect(a!.color.fade).toBe(0.05)
    expect(a!.aspect).toEqual([2, 3])
    expect(b!.grain).toMatchObject({ intensity: 0.3, size: 2 })
  })

  it('turns options on and off', () => {
    const lib = library([
      {
        id: 'cam',
        name: 'Cam',
        category: 'instant',
        options: { frame: true, lightLeak: false, dateStamp: true },
        frameColors: [
          { name: 'White', color: '#ffffff' },
          { name: 'Pink', color: '#ffc0cb' },
        ],
        look: { frame: { style: 'instax-mini' }, lightLeak: { intensity: 0.4 }, dateStamp: true },
      },
    ])
    const cam = lib.cameras[0]!
    const defaults = lib.defaultChoice(cam)
    expect(defaults).toMatchObject({ frame: true, lightLeak: false, dateStamp: true })
    const first = lib.resolve(cam, defaults)
    expect(first.frame).toEqual({ style: 'instax-mini', color: '#ffffff', text: '' })
    expect(first.lightLeak).toBeUndefined()
    expect(first.dateStamp).toBe(true)
    // The same choice gives the same look, so its LUT is reused.
    expect(lib.resolve(cam, { ...defaults })).toBe(first)

    const changed = lib.resolve(cam, {
      ...defaults,
      frame: false,
      lightLeak: true,
      dateStamp: false,
      frameColor: 'Pink',
    })
    expect(changed.frame).toBeUndefined()
    expect(changed.lightLeak?.intensity).toBe(0.4)
    expect(changed.dateStamp).toBe(false)
    expect(changed.color).toBe(first.color)
    expect(lib.resolve(cam, { ...defaults, frameColor: 'Pink' }).frame?.color).toBe('#ffc0cb')
  })

  it('repairs stored choices that no longer fit', () => {
    const slr = cameraLibrary.camera('slr-35')!
    expect(validChoice(slr, { profile: 'gone', frame: 'yes' })).toEqual(
      cameraLibrary.defaultChoice(slr),
    )
    expect(validChoice(slr, { profile: 'vivid', frame: true }).profile).toBe('vivid')
    expect(validChoice(slr, null)).toEqual(cameraLibrary.defaultChoice(slr))
  })

  it('rejects options without the effect they turn on', () => {
    const camera = (options: unknown, look: unknown = {}) => ({
      id: 'c',
      name: 'C',
      category: 'film135',
      options,
      look,
    })
    expect(() => library([camera({ frame: true })])).toThrow(/needs a frame/)
    expect(() => library([camera({ lightLeak: true })])).toThrow(/needs a lightLeak/)
    expect(() => library([camera({ zoom: true })])).toThrow(/unknown option/)
  })

  it('rejects broken aliases and duplicate ids', () => {
    const cam = { id: 'c', name: 'C', category: 'digital' }
    expect(() => library([cam], { old: 'missing' })).toThrow(/no camera/)
    expect(() => library([cam, cam])).toThrow(/unique/)
    expect(() =>
      library([
        {
          ...cam,
          profiles: [
            { id: 'a', name: 'A' },
            { id: 'a', name: 'B' },
          ],
        },
      ]),
    ).toThrow(/unique/)
  })
})

describe('decodePreset', () => {
  it('uses defaults for missing fields', () => {
    const preset = look({ grain: { intensity: 0.2 } })
    expect(preset.inspiredBy).toBeUndefined()
    expect(isIdentityColor(preset.color)).toBe(true)
    expect(preset.grain).toEqual({
      intensity: 0.2,
      size: 1,
      chroma: 0,
      roughness: 0,
      response: [1, 1, 1],
    })
    expect(preset.dateStamp).toBe(false)
    expect(preset.lightLeak).toBeUndefined()
    expect(preset.jitter).toBe(false)
  })

  it('gives light leaks a warm default color', () => {
    expect(look({ lightLeak: { intensity: 0.3 } }).lightLeak).toEqual({
      intensity: 0.3,
      color: [1, 0.45, 0.15],
      edgeColor: [1, 0.75, 0.3],
      chance: 1,
    })
  })

  it('decodes shapes and frames', () => {
    const p = look({ aspect: [2, 3], frame: { style: 'film-35', text: 'PF 400' } })
    expect(p.aspect).toEqual([2, 3])
    expect(p.frame).toEqual({ style: 'film-35', color: '#0e0d0c', text: 'PF 400' })
    for (const style of frameStyles) expect(look({ frame: { style } }).frame?.style).toBe(style)
    expect(() => look({ aspect: [2, 0] })).toThrow(/width, height/)
    expect(() => look({ frame: { style: 'polaroid' } })).toThrow(/unknown frame/)
  })

  it('rejects a curve with decreasing x', () => {
    const color = {
      curves: {
        master: [
          [0, 0],
          [0.6, 0.5],
          [0.4, 0.7],
          [1, 1],
        ],
      },
    }
    expect(() => look({ color })).toThrow(/increase/)
  })

  it('decodes film color stages with defaults', () => {
    const color = look({
      color: {
        filmCurve: { contrast: 1.2 },
        hue: { yellow: { lum: 0.3 } },
        matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      },
    }).color
    expect(color.filmCurve).toEqual({
      contrast: 1.2,
      toe: 0.5,
      shoulder: 0.5,
      channelContrast: [1, 1, 1],
    })
    expect(color.hue).toEqual({ yellow: { hue: 0, sat: 0, lum: 0.3 } })
    expect(color.matrix).toHaveLength(9)
  })

  it('rejects an unknown hue band and a short matrix', () => {
    expect(() => look({ color: { hue: { teal: { hue: 10 } } } })).toThrow(/hue band/)
    expect(() => look({ color: { matrix: [1, 0, 0] } })).toThrow(/nine/)
  })

  it('rejects an unknown category and a missing name', () => {
    expect(() => decodePreset({ id: 'x', name: 'X', category: 'toy' })).toThrow()
    expect(() => decodePreset({ id: 'x', category: 'film135' })).toThrow()
  })
})
