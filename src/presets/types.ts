import type { ToneCurve } from '@/render/toneCurve'

export type Vec3 = readonly [number, number, number]

export type PresetCategory = 'film' | 'digital' | 'disposable'

export const presetCategories: readonly { id: PresetCategory; title: string }[] = [
  { id: 'film', title: 'Film' },
  { id: 'digital', title: 'Digital' },
  { id: 'disposable', title: 'Disposable' },
]

export interface RGBCurves {
  master?: ToneCurve
  red?: ToneCurve
  green?: ToneCurve
  blue?: ToneCurve
}

/** A 3×3 matrix, row by row: output red is `m[0]*r + m[1]*g + m[2]*b`, and so on. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

/**
 * A film characteristic curve: an S-curve around mid-gray with a separate toe (shadows) and
 * shoulder (highlights). Different contrast per channel gives film's color crossover,
 * e.g. blue shadows with warm highlights.
 */
export interface FilmCurve {
  /** Midtone contrast; 1 keeps the slope through mid-gray. */
  contrast: number
  /** 0 (hard, digital-like) ... 1 (long, soft toe that holds shadow detail). */
  toe: number
  /** 0 (hard, digital-like) ... 1 (long, soft shoulder that holds highlight detail). */
  shoulder: number
  /** Multiplies `contrast` per channel. */
  channelContrast: Vec3
}

export const hueBandNames = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
] as const

export type HueBandName = (typeof hueBandNames)[number]

/** Changes to the colors near one hue. Neutrals are never affected. */
export interface HueBand {
  /** Hue shift in degrees, roughly -60...60. */
  hue: number
  /** -1 (gray) ... 1 (twice as saturated). */
  sat: number
  /** -1 (darker) ... 1 (lighter). */
  lum: number
}

export type HueBands = Partial<Record<HueBandName, HueBand>>

/** Color and tone adjustments. These are baked into a single 3D LUT per preset. */
export interface ColorSettings {
  /** Exposure change in stops. */
  exposure: number
  /** -1 (flat) ... 1 (strong S-curve). */
  contrast: number
  /** 1 leaves color unchanged, 0 is grayscale. */
  saturation: number
  /** Saturation multiplier in the shadows, so film can lose color in the dark tones. */
  shadowSaturation: number
  /** Saturation multiplier in the highlights. */
  highlightSaturation: number
  /** -1 (cool) ... 1 (warm). */
  temperature: number
  /** -1 (green) ... 1 (magenta). */
  tint: number
  /** Lifts blacks to this level, 0...0.3. */
  fade: number
  /** Compresses highlights softly instead of clipping them, 0...1. */
  highlightRolloff: number
  /**
   * Makes highlights clip like a small digital sensor, 0...1: once one channel is nearly
   * full, the color bleaches to white.
   */
  clip: number
  /** Channel mixing in linear light, e.g. dye cross-talk or infrared color swaps. */
  matrix?: Mat3
  /** Replaces `contrast` with a film characteristic curve. */
  filmCurve?: FilmCurve
  /** Hue-selective changes, e.g. lighter yellows or cyan-leaning blues. */
  hue: HueBands
  monochrome: boolean
  /** Channel weights for black and white conversion. */
  monoMix: Vec3
  /** RGB offsets added to the shadows (split toning), roughly -0.1...0.1. */
  shadowTint: Vec3
  /** RGB offsets added to the highlights (split toning), roughly -0.1...0.1. */
  highlightTint: Vec3
  curves: RGBCurves
}

export interface GrainSettings {
  /** 0...1. */
  intensity: number
  /** Relative grain size; 1 is typical 35mm grain. */
  size: number
}

export interface HalationSettings {
  /** Strength of the red glow around bright highlights, 0...1. */
  intensity: number
  /** Relative glow radius. */
  radius: number
}

export interface LightLeakSettings {
  /** 0...1. */
  intensity: number
  /** RGB color of the leak. */
  color: Vec3
}

/** A film, digital camera or disposable camera look, decoded from `presets.json`. */
export interface FilmPreset {
  id: string
  name: string
  /** The real camera or film this look is modeled on, shown as a subtitle. */
  inspiredBy?: string
  category: PresetCategory
  color: ColorSettings
  grain?: GrainSettings
  halation?: HalationSettings
  /** Soft glow from a cheap plastic lens, 0...1. */
  softness: number
  /** On-camera flash: brighter center that falls off quickly, 0...1. */
  flash: number
  /** Edge darkening, 0...1. */
  vignette: number
  lightLeak?: LightLeakSettings
  /** Orange date imprint in the bottom-right corner. */
  dateStamp: boolean
}

export function defaultColorSettings(): ColorSettings {
  return {
    exposure: 0,
    contrast: 0,
    saturation: 1,
    shadowSaturation: 1,
    highlightSaturation: 1,
    temperature: 0,
    tint: 0,
    fade: 0,
    highlightRolloff: 0,
    clip: 0,
    hue: {},
    monochrome: false,
    monoMix: [0.2126, 0.7152, 0.0722],
    shadowTint: [0, 0, 0],
    highlightTint: [0, 0, 0],
    curves: {},
  }
}

export function isIdentityColor(c: ColorSettings): boolean {
  const d = defaultColorSettings()
  const sameVec = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  return (
    c.exposure === d.exposure &&
    c.contrast === d.contrast &&
    c.saturation === d.saturation &&
    c.shadowSaturation === d.shadowSaturation &&
    c.highlightSaturation === d.highlightSaturation &&
    c.temperature === d.temperature &&
    c.tint === d.tint &&
    c.fade === d.fade &&
    c.highlightRolloff === d.highlightRolloff &&
    c.clip === d.clip &&
    !c.matrix &&
    !c.filmCurve &&
    Object.keys(c.hue).length === 0 &&
    c.monochrome === d.monochrome &&
    sameVec(c.monoMix, d.monoMix) &&
    sameVec(c.shadowTint, d.shadowTint) &&
    sameVec(c.highlightTint, d.highlightTint) &&
    !c.curves.master &&
    !c.curves.red &&
    !c.curves.green &&
    !c.curves.blue
  )
}
