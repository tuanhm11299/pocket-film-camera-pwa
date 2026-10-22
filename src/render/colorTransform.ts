import type { ColorSettings, Vec3 } from '@/presets/types'

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

/** The per-pixel color math for a preset, evaluated on sRGB values in 0...1. */
export class ColorTransform {
  private readonly exposureGain: number
  private readonly whiteBalance: Vec3
  private readonly monoWeights: Vec3

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
  }

  apply(input: Vec3): RGB {
    const s = this.settings

    // Light: exposure, white balance and highlight rolloff in linear space.
    let c: RGB = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      const linear = this.rolloff(
        srgbToLinear(input[i]!) * this.exposureGain * this.whiteBalance[i]!,
      )
      c[i] = linearToSRGB(clamp01(linear))
    }

    // Tone and color in gamma space, where the adjustments look even.
    if (s.contrast !== 0) {
      c = c.map((x) => x + s.contrast * (x * x * (3 - 2 * x) - x)) as RGB
    }
    const luma = dot(c, lumaWeights)
    c = c.map((x) => luma + (x - luma) * s.saturation) as RGB
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
}
