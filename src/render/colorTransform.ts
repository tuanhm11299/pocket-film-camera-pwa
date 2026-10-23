import {
  hueBandNames,
  type ColorSettings,
  type FilmCurve,
  type HueBand,
  type Mat3,
  type Vec3,
} from '@/presets/types'

type RGB = [number, number, number]

const lumaWeights: Vec3 = [0.2126, 0.7152, 0.0722]

export function srgbToLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}

export function linearToSRGB(x: number): number {
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Mid-gray (18% reflectance) in sRGB, the point film curves turn around. */
const filmPivot = 0.46

/** Hue of the center of each band, in degrees on the RGB color wheel. */
const hueBandCenters = [0, 30, 60, 120, 180, 225, 270, 315]

/**
 * One half of a film curve on 0...1: starts with `slope`, ends at 1. `k` sets how close to the
 * end the curve straightens out again: 1 gives a long, soft shoulder, 4 a short, hard one.
 * Monotone for slopes up to 2.
 */
function filmHalf(u: number, slope: number, k: number): number {
  return u + (slope - 1) * u * Math.pow(1 - u, k)
}

/** The value of a film curve channel at `v`, in sRGB. */
export function filmCurveValue(curve: FilmCurve, channel: number, value: number): number {
  const v = clamp01(value)
  const slope = Math.min(Math.max(curve.contrast * curve.channelContrast[channel]!, 0.25), 2)
  const p = filmPivot
  if (v >= p) {
    const k = 4 - 3 * clamp01(curve.shoulder)
    return p + (1 - p) * filmHalf((v - p) / (1 - p), slope, k)
  }
  const k = 4 - 3 * clamp01(curve.toe)
  return p - p * filmHalf((p - v) / p, slope, k)
}

/** Hue in degrees (0 red, 120 green, 240 blue) and chroma of an RGB color. */
export function hueAndChroma(c: Vec3): { hue: number; chroma: number } {
  const [r, g, b] = c
  const max = Math.max(r, g, b)
  const chroma = max - Math.min(r, g, b)
  if (chroma < 1e-6) return { hue: 0, chroma: 0 }
  let hue: number
  if (max === r) hue = 60 * (((g - b) / chroma + 6) % 6)
  else if (max === g) hue = 60 * ((b - r) / chroma + 2)
  else hue = 60 * ((r - g) / chroma + 4)
  return { hue, chroma }
}

/** Rotates a color around the gray axis; positive angles go red → yellow → green. */
function rotateHue(c: RGB, degrees: number): RGB {
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const k = 1 / Math.sqrt(3)
  const [r, g, b] = c
  const along = k * (r + g + b) * (1 - cos)
  // Rodrigues' rotation about (1, 1, 1) / √3.
  return [
    r * cos + k * (b - g) * sin + k * along,
    g * cos + k * (r - b) * sin + k * along,
    b * cos + k * (g - r) * sin + k * along,
  ]
}

/** The per-pixel color math for a preset, evaluated on sRGB values in 0...1. */
export class ColorTransform {
  private readonly exposureGain: number
  private readonly whiteBalance: Vec3
  private readonly monoWeights: Vec3
  private readonly bands: HueBand[] | undefined

  constructor(readonly settings: ColorSettings) {
    this.exposureGain = Math.pow(2, settings.exposure)
    this.whiteBalance = [
      1 + 0.12 * settings.temperature,
      1 - 0.08 * settings.tint,
      1 - 0.12 * settings.temperature,
    ]
    const mix = settings.monoMix
    const mixSum = mix[0] + mix[1] + mix[2]
    this.monoWeights =
      mixSum > 0 ? [mix[0] / mixSum, mix[1] / mixSum, mix[2] / mixSum] : lumaWeights
    if (Object.keys(settings.hue).length > 0) {
      this.bands = hueBandNames.map((name) => settings.hue[name] ?? { hue: 0, sat: 0, lum: 0 })
    }
  }

  apply(input: Vec3): RGB {
    const s = this.settings

    // Light: exposure, white balance, channel mixing, clipping and rolloff in linear space.
    let c: RGB = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      c[i] = srgbToLinear(input[i]!) * this.exposureGain * this.whiteBalance[i]!
    }
    if (s.matrix) c = multiply(s.matrix, c)
    if (s.clip > 0) c = this.clip(c)
    c = c.map((x) => linearToSRGB(clamp01(this.rolloff(x)))) as RGB

    // Tone and color in gamma space, where the adjustments look even.
    if (s.filmCurve) {
      const curve = s.filmCurve
      c = c.map((x, i) => filmCurveValue(curve, i, x)) as RGB
    } else if (s.contrast !== 0) {
      c = c.map((x) => x + s.contrast * (x * x * (3 - 2 * x) - x)) as RGB
    }
    if (this.bands) c = this.applyHueBands(c, this.bands)

    const luma = dot(c, lumaWeights)
    const tone = clamp01(luma)
    const saturation =
      s.saturation *
      (1 +
        (s.shadowSaturation - 1) * (1 - smoothstep(0, 0.5, tone)) +
        (s.highlightSaturation - 1) * smoothstep(0.5, 1, tone))
    c = c.map((x) => luma + (x - luma) * saturation) as RGB
    if (s.monochrome) {
      const mono = dot(c, this.monoWeights)
      c = [mono, mono, mono]
    }

    const l = clamp01(dot(c, lumaWeights))
    const shadow = (1 - l) * (1 - l)
    const highlight = l * l
    c = c.map((x, i) =>
      clamp01(x + s.shadowTint[i]! * shadow + s.highlightTint[i]! * highlight),
    ) as RGB

    const { master, red, green, blue } = s.curves
    if (master) c = c.map((x) => master.value(x)) as RGB
    if (red) c[0] = red.value(c[0])
    if (green) c[1] = green.value(c[1])
    if (blue) c[2] = blue.value(c[2])

    return c.map((x) => clamp01(s.fade + x * (1 - s.fade))) as RGB
  }

  private rolloff(x: number): number {
    const amount = Math.min(this.settings.highlightRolloff, 1)
    if (amount <= 0) return x
    const knee = 1 - 0.6 * amount
    return x <= knee ? x : knee + (1 - knee) * (1 - Math.exp(-(x - knee) / (1 - knee)))
  }

  /** Bleaches colors toward white as their brightest channel nears full, like a small sensor. */
  private clip(c: RGB): RGB {
    const amount = Math.min(this.settings.clip, 1)
    const max = Math.max(...c)
    const knee = 1 - 0.45 * amount
    const t = smoothstep(knee, 1, max) * amount
    return c.map((x) => Math.min(x + (max - x) * t, 1)) as RGB
  }

  private applyHueBands(c: RGB, bands: HueBand[]): RGB {
    const { hue, chroma } = hueAndChroma(c)
    if (chroma === 0) return c
    // Interpolate between the two bands on either side of this hue.
    let i = hueBandCenters.length - 1
    while (i > 0 && hueBandCenters[i]! > hue) i--
    const next = (i + 1) % hueBandCenters.length
    const start = hueBandCenters[i]!
    const end = next === 0 ? 360 : hueBandCenters[next]!
    const t = smoothstep(0, 1, (hue - start) / (end - start))
    const a = bands[i]!
    const b = bands[next]!
    const shift = a.hue + (b.hue - a.hue) * t
    const sat = a.sat + (b.sat - a.sat) * t
    const lum = a.lum + (b.lum - a.lum) * t

    // Nearly gray colors have an unstable hue, so they are changed less.
    const weight = smoothstep(0, 0.25, chroma)
    let out = shift !== 0 ? rotateHue(c, shift * weight) : c
    if (sat !== 0) {
      const luma = dot(out, lumaWeights)
      const k = 1 + sat * weight
      out = out.map((x) => luma + (x - luma) * k) as RGB
    }
    if (lum !== 0) {
      const k = 1 + 0.5 * lum * weight
      out = out.map((x) => x * k) as RGB
    }
    return out.map(clamp01) as RGB
  }
}

function multiply(m: Mat3, c: RGB): RGB {
  return [
    Math.max(m[0] * c[0] + m[1] * c[1] + m[2] * c[2], 0),
    Math.max(m[3] * c[0] + m[4] * c[1] + m[5] * c[2], 0),
    Math.max(m[6] * c[0] + m[7] * c[1] + m[8] * c[2], 0),
  ]
}
