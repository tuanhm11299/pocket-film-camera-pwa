import type { ToneCurve } from '@/render/toneCurve'

export type Vec3 = readonly [number, number, number]

export type PresetCategory = 'digital' | 'film135' | 'film120' | 'instant' | 'disposable'

export const presetCategories: readonly { id: PresetCategory; title: string }[] = [
  { id: 'digital', title: 'Digital' },
  { id: 'film135', title: '135' },
  { id: 'film120', title: '120' },
  { id: 'instant', title: 'Instant' },
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
  /** 0 (black and white grain) ... 1 (independent grain per color layer, or sensor noise). */
  chroma: number
  /** Adds coarser clumps to the fine grain, 0...1. */
  roughness: number
  /**
   * Grain strength in the shadows, midtones and highlights. Negative film has little grain
   * in the highlights; digital sensor noise is strongest in the shadows.
   */
  response: Vec3
}

export interface HalationSettings {
  /** Strength of the red glow around bright highlights, 0...1. */
  intensity: number
  /** Relative glow radius. */
  radius: number
  /** RGB color of the glow. */
  color: Vec3
  /** Brightness (0...1) where highlights start to glow. */
  threshold: number
}

/** A soft white glow around the bright parts of the image, like diffusion or old coatings. */
export interface BloomSettings {
  /** 0...1. */
  intensity: number
  /** Relative glow radius. */
  radius: number
  /** Brightness (0...1) where the glow starts. */
  threshold: number
}

export interface LightLeakSettings {
  /** 0...1. */
  intensity: number
  /** RGB color at the hot core of the leak. */
  color: Vec3
  /** RGB color the leak fades through toward its edge. */
  edgeColor: Vec3
  /** How likely a shot is to have a leak, 0...1. */
  chance: number
}

export interface LensSettings {
  /** Positive bulges the image like a cheap wide lens (barrel), negative pinches it (pincushion). -1...1. */
  distortion: number
  /** Red and blue fringes toward the edges, 0...1. */
  chromaticAberration: number
  /** Out-of-focus edges and corners, 0...1. */
  edgeBlur: number
  /** A slightly soft picture overall, like an instant print, 0...1. */
  blur: number
}

/** How much each shot can differ from the last, like a fixed-exposure camera. */
export interface VariationSettings {
  /** Largest exposure change in stops. */
  exposure: number
  /** Largest white balance change, in `temperature` units. */
  temperature: number
}

export const frameStyles = [
  'instax-mini',
  'instax-square',
  'instant-white',
  'film-35',
  'film-120',
  'slide-mount',
] as const

export type FrameStyle = (typeof frameStyles)[number]

/** A border drawn around the photo: an instant print, a film strip or a slide mount. */
export interface FrameSettings {
  style: FrameStyle
  /** CSS color of the paper, film base or mount. */
  color: string
  /** Edge print on film frames, e.g. "PF 400". */
  text: string
}

export const noLens: LensSettings = { distortion: 0, chromaticAberration: 0, edgeBlur: 0, blur: 0 }
export const noVariation: VariationSettings = { exposure: 0, temperature: 0 }

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
  bloom?: BloomSettings
  /** Soft glow from a cheap plastic lens, 0...1. */
  softness: number
  lens: LensSettings
  /** On-camera flash: brighter center that falls off quickly, 0...1. */
  flash: number
  /** RGB color of the flash, white unless it has a colored filter. */
  flashColor: Vec3
  /** Edge darkening, 0...1. */
  vignette: number
  lightLeak?: LightLeakSettings
  variation: VariationSettings
  /** Orange date imprint in the bottom-right corner. */
  dateStamp: boolean
  /** CSS color of the date imprint. */
  dateStampColor: string
  /**
   * Width and height of the picture, e.g. [2, 3] for a 35mm frame held upright. Without it,
   * the camera shoots 3:4 and edited photos keep their shape.
   */
  aspect?: readonly [number, number]
  frame?: FrameSettings
  /** Film frames sit a little crooked and off-center, like a film strip in a scanner. */
  jitter: boolean
}

/** Toggles a camera offers, with their default state. */
export interface CameraOptions {
  frame?: boolean
  lightLeak?: boolean
  dateStamp?: boolean
  jitter?: boolean
}

export type CameraToggle = keyof CameraOptions

export const cameraToggles: readonly { id: CameraToggle; title: string }[] = [
  { id: 'frame', title: 'Frame' },
  { id: 'lightLeak', title: 'Light Leak' },
  { id: 'dateStamp', title: 'Date' },
  { id: 'jitter', title: 'Jitter' },
]

export interface FrameColor {
  name: string
  /** CSS color. */
  color: string
}

/** One color look of a camera, like a film loaded into it. */
export interface CameraProfile {
  id: string
  name: string
  /** The film or color profile this is modeled on. */
  inspiredBy?: string
  /** What the look is aiming for, to guide tuning. */
  notes?: string
  /** The complete look with every option on. */
  look: FilmPreset
}

/** A camera from `cameras.json`: one or more profiles, a format and options. */
export interface Camera {
  id: string
  name: string
  inspiredBy?: string
  category: PresetCategory
  profiles: readonly CameraProfile[]
  options: CameraOptions
  /** Paper colors for instant frames; the first is the default. */
  frameColors: readonly FrameColor[]
}

/** What the user picked for a camera. */
export interface CameraChoice {
  profile: string
  frame: boolean
  lightLeak: boolean
  dateStamp: boolean
  jitter: boolean
  /** A `FrameColor` name. */
  frameColor: string
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
