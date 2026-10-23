import presetsFile from './presets.json'
import { ToneCurve } from '@/render/toneCurve'
import {
  defaultColorSettings,
  hueBandNames,
  type ColorSettings,
  type FilmCurve,
  type FilmPreset,
  type GrainSettings,
  type HueBandName,
  type HueBands,
  type LensSettings,
  type Mat3,
  type PresetCategory,
  type RGBCurves,
  type VariationSettings,
  type Vec3,
  noLens,
  noVariation,
} from './types'

export class PresetDecodeError extends Error {}

type Json = Record<string, unknown>

function fail(path: string, message: string): never {
  throw new PresetDecodeError(`${path}: ${message}`)
}

function object(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'expected an object')
  }
  return value as Json
}

function number(obj: Json, key: string, path: string, fallback?: number): number {
  const value = obj[key]
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(`${path}.${key}`, 'expected a number')
  return value
}

function string(obj: Json, key: string, path: string): string {
  const value = obj[key]
  if (typeof value !== 'string') fail(`${path}.${key}`, 'expected a string')
  return value
}

function boolean(obj: Json, key: string, path: string, fallback: boolean): boolean {
  const value = obj[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') fail(`${path}.${key}`, 'expected true or false')
  return value
}

function vec3(obj: Json, key: string, path: string, fallback: Vec3): Vec3 {
  const value = obj[key]
  if (value === undefined) return fallback
  if (!Array.isArray(value) || value.length !== 3 || !value.every((v) => typeof v === 'number')) {
    fail(`${path}.${key}`, 'expected three numbers')
  }
  const [x, y, z] = value as [number, number, number]
  return [x, y, z]
}

function matrix(obj: Json, key: string, path: string): Mat3 | undefined {
  const value = obj[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length !== 9 || !value.every((v) => Number.isFinite(v))) {
    fail(`${path}.${key}`, 'expected nine numbers')
  }
  return [...value] as unknown as Mat3
}

function filmCurve(obj: Json, key: string, path: string): FilmCurve | undefined {
  if (obj[key] === undefined) return undefined
  const f = object(obj[key], `${path}.${key}`)
  const p = `${path}.${key}`
  return {
    contrast: number(f, 'contrast', p, 1),
    toe: number(f, 'toe', p, 0.5),
    shoulder: number(f, 'shoulder', p, 0.5),
    channelContrast: vec3(f, 'channelContrast', p, [1, 1, 1]),
  }
}

function hueBands(obj: Json, key: string, path: string): HueBands {
  if (obj[key] === undefined) return {}
  const raw = object(obj[key], `${path}.${key}`)
  const bands: HueBands = {}
  for (const [name, value] of Object.entries(raw)) {
    const p = `${path}.${key}.${name}`
    if (!hueBandNames.includes(name as HueBandName)) fail(p, 'unknown hue band')
    const b = object(value, p)
    bands[name as HueBandName] = {
      hue: number(b, 'hue', p, 0),
      sat: number(b, 'sat', p, 0),
      lum: number(b, 'lum', p, 0),
    }
  }
  return bands
}

function curve(obj: Json, key: string, path: string): ToneCurve | undefined {
  const value = obj[key]
  if (value === undefined) return undefined
  try {
    return ToneCurve.fromPairs(value)
  } catch (error) {
    fail(`${path}.${key}`, (error as Error).message)
  }
}

function decodeColor(value: unknown, path: string): ColorSettings {
  const defaults = defaultColorSettings()
  if (value === undefined) return defaults
  const c = object(value, path)
  let curves: RGBCurves = {}
  if (c.curves !== undefined) {
    const raw = object(c.curves, `${path}.curves`)
    curves = {
      master: curve(raw, 'master', `${path}.curves`),
      red: curve(raw, 'red', `${path}.curves`),
      green: curve(raw, 'green', `${path}.curves`),
      blue: curve(raw, 'blue', `${path}.curves`),
    }
    curves = Object.fromEntries(Object.entries(curves).filter(([, v]) => v !== undefined))
  }
  const settings: ColorSettings = {
    exposure: number(c, 'exposure', path, defaults.exposure),
    contrast: number(c, 'contrast', path, defaults.contrast),
    saturation: number(c, 'saturation', path, defaults.saturation),
    shadowSaturation: number(c, 'shadowSaturation', path, defaults.shadowSaturation),
    highlightSaturation: number(c, 'highlightSaturation', path, defaults.highlightSaturation),
    temperature: number(c, 'temperature', path, defaults.temperature),
    tint: number(c, 'tint', path, defaults.tint),
    fade: number(c, 'fade', path, defaults.fade),
    highlightRolloff: number(c, 'highlightRolloff', path, defaults.highlightRolloff),
    clip: number(c, 'clip', path, defaults.clip),
    hue: hueBands(c, 'hue', path),
    monochrome: boolean(c, 'monochrome', path, defaults.monochrome),
    monoMix: vec3(c, 'monoMix', path, defaults.monoMix),
    shadowTint: vec3(c, 'shadowTint', path, defaults.shadowTint),
    highlightTint: vec3(c, 'highlightTint', path, defaults.highlightTint),
    curves,
  }
  const m = matrix(c, 'matrix', path)
  if (m) settings.matrix = m
  const f = filmCurve(c, 'filmCurve', path)
  if (f) settings.filmCurve = f
  return settings
}

function decodeGrain(value: unknown, path: string): GrainSettings {
  const g = object(value, path)
  return {
    intensity: number(g, 'intensity', path),
    size: number(g, 'size', path, 1),
    chroma: number(g, 'chroma', path, 0),
    roughness: number(g, 'roughness', path, 0),
    response: vec3(g, 'response', path, [1, 1, 1]),
  }
}

function decodeLens(value: unknown, path: string): LensSettings {
  if (value === undefined) return noLens
  const l = object(value, path)
  return {
    distortion: number(l, 'distortion', path, 0),
    chromaticAberration: number(l, 'chromaticAberration', path, 0),
    edgeBlur: number(l, 'edgeBlur', path, 0),
  }
}

function decodeVariation(value: unknown, path: string): VariationSettings {
  if (value === undefined) return noVariation
  const v = object(value, path)
  return {
    exposure: number(v, 'exposure', path, 0),
    temperature: number(v, 'temperature', path, 0),
  }
}

const categories: readonly PresetCategory[] = ['film', 'digital', 'disposable']

/** Decodes one preset. Every field except `id`, `name` and `category` defaults to "no change". */
export function decodePreset(value: unknown, path = 'preset'): FilmPreset {
  const p = object(value, path)
  const category = string(p, 'category', path)
  if (!categories.includes(category as PresetCategory))
    fail(`${path}.category`, `unknown category "${category}"`)

  const preset: FilmPreset = {
    id: string(p, 'id', path),
    name: string(p, 'name', path),
    category: category as PresetCategory,
    color: decodeColor(p.color, `${path}.color`),
    softness: number(p, 'softness', path, 0),
    lens: decodeLens(p.lens, `${path}.lens`),
    flash: number(p, 'flash', path, 0),
    flashColor: vec3(p, 'flashColor', path, [1, 1, 1]),
    vignette: number(p, 'vignette', path, 0),
    variation: decodeVariation(p.variation, `${path}.variation`),
    dateStamp: boolean(p, 'dateStamp', path, false),
  }
  if (p.inspiredBy !== undefined) preset.inspiredBy = string(p, 'inspiredBy', path)
  if (p.grain !== undefined) preset.grain = decodeGrain(p.grain, `${path}.grain`)
  if (p.halation !== undefined) {
    const h = object(p.halation, `${path}.halation`)
    const hp = `${path}.halation`
    preset.halation = {
      intensity: number(h, 'intensity', hp),
      radius: number(h, 'radius', hp, 1),
      color: vec3(h, 'color', hp, [1, 0.25, 0.08]),
      threshold: number(h, 'threshold', hp, 0.7),
    }
  }
  if (p.bloom !== undefined) {
    const b = object(p.bloom, `${path}.bloom`)
    const bp = `${path}.bloom`
    preset.bloom = {
      intensity: number(b, 'intensity', bp),
      radius: number(b, 'radius', bp, 1),
      threshold: number(b, 'threshold', bp, 0.6),
    }
  }
  if (p.lightLeak !== undefined) {
    const l = object(p.lightLeak, `${path}.lightLeak`)
    const lp = `${path}.lightLeak`
    preset.lightLeak = {
      intensity: number(l, 'intensity', lp),
      color: vec3(l, 'color', lp, [1.0, 0.45, 0.15]),
      edgeColor: vec3(l, 'edgeColor', lp, [1.0, 0.75, 0.3]),
      chance: number(l, 'chance', lp, 1),
    }
  }
  return preset
}

/** All presets bundled with the app. */
export class PresetLibrary {
  constructor(readonly presets: readonly FilmPreset[]) {}

  /** Decodes a `{"presets": [...]}` document. */
  static decode(value: unknown): PresetLibrary {
    const file = object(value, 'file')
    if (!Array.isArray(file.presets)) fail('file.presets', 'expected an array')
    return new PresetLibrary(file.presets.map((p, i) => decodePreset(p, `presets[${i}]`)))
  }

  presetsIn(category: PresetCategory): FilmPreset[] {
    return this.presets.filter((p) => p.category === category)
  }

  preset(id: string): FilmPreset | undefined {
    return this.presets.find((p) => p.id === id)
  }
}

export const presetLibrary = PresetLibrary.decode(presetsFile)

export const defaultCameraPresetId = 'gold-200'
export const defaultEditorPresetId = 'clean'

export function presetOrDefault(id: string | null | undefined, fallbackId: string): FilmPreset {
  return (
    presetLibrary.preset(id ?? '') ?? presetLibrary.preset(fallbackId) ?? presetLibrary.presets[0]!
  )
}
