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

/** Color and tone adjustments. These are baked into a single 3D LUT per preset. */
export interface ColorSettings {
  /** Exposure change in stops. */
  exposure: number
  /** -1 (flat) ... 1 (strong S-curve). */
  contrast: number
  /** 1 leaves color unchanged, 0 is grayscale. */
  saturation: number
  /** -1 (cool) ... 1 (warm). */
  temperature: number
  /** -1 (green) ... 1 (magenta). */
  tint: number
  /** Lifts blacks to this level, 0...0.3. */
  fade: number
  /** Compresses highlights softly instead of clipping them, 0...1. */
  highlightRolloff: number
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
    temperature: 0,
    tint: 0,
    fade: 0,
    highlightRolloff: 0,
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
    c.temperature === d.temperature &&
    c.tint === d.tint &&
    c.fade === d.fade &&
    c.highlightRolloff === d.highlightRolloff &&
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
