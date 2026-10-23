import camerasFile from './cameras.json'
import { ToneCurve } from '@/render/toneCurve'
import {
  cameraToggles,
  defaultColorSettings,
  frameStyles,
  hueBandNames,
  presetCategories,
  type Camera,
  type CameraChoice,
  type CameraOptions,
  type CameraProfile,
  type CameraToggle,
  type FrameColor,
  type FrameSettings,
  type FrameStyle,
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
    blur: number(l, 'blur', path, 0),
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

const categories: readonly PresetCategory[] = presetCategories.map((c) => c.id)

export const defaultStampColor = 'rgb(255, 140, 31)'

const defaultFrameColor: Record<FrameStyle, string> = {
  'instax-mini': '#f3f1ea',
  'instax-square': '#f3f1ea',
  'instant-white': '#f1efe8',
  'film-35': '#0e0d0c',
  'film-120': '#0e0d0c',
  'slide-mount': '#e8e2d4',
}

function decodeAspect(obj: Json, path: string): [number, number] | undefined {
  const value = obj.aspect
  if (value === undefined) return undefined
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((v) => typeof v === 'number' && v > 0)
  ) {
    fail(`${path}.aspect`, 'expected [width, height]')
  }
  return [value[0], value[1]]
}

function decodeFrame(value: unknown, path: string): FrameSettings {
  const f = object(value, path)
  const style = string(f, 'style', path)
  if (!frameStyles.includes(style as FrameStyle)) fail(`${path}.style`, `unknown frame "${style}"`)
  return {
    style: style as FrameStyle,
    color:
      f.color === undefined ? defaultFrameColor[style as FrameStyle] : string(f, 'color', path),
    text: f.text === undefined ? '' : string(f, 'text', path),
  }
}

/** Decodes one look. Every field except `id`, `name` and `category` defaults to "no change". */
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
    dateStampColor:
      p.dateStampColor === undefined ? defaultStampColor : string(p, 'dateStampColor', path),
    jitter: boolean(p, 'jitter', path, false),
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
  const aspect = decodeAspect(p, path)
  if (aspect) preset.aspect = aspect
  if (p.frame !== undefined) preset.frame = decodeFrame(p.frame, `${path}.frame`)
  return preset
}

/** Merges JSON objects key by key, so a profile only lists what it changes. */
export function mergeJSON(base: unknown, override: unknown): unknown {
  const isObject = (v: unknown): v is Json =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
  if (!isObject(base) || !isObject(override)) return override === undefined ? base : override
  const merged: Json = { ...base }
  for (const [key, value] of Object.entries(override)) merged[key] = mergeJSON(base[key], value)
  return merged
}

function decodeCamera(value: unknown, path: string): Camera {
  const c = object(value, path)
  const id = string(c, 'id', path)
  const name = string(c, 'name', path)
  const category = string(c, 'category', path)
  const inspiredBy = c.inspiredBy === undefined ? undefined : string(c, 'inspiredBy', path)
  const base = c.look === undefined ? {} : object(c.look, `${path}.look`)
  const rawProfiles = c.profiles === undefined ? [{ id: 'default', name }] : c.profiles
  if (!Array.isArray(rawProfiles) || rawProfiles.length === 0) {
    fail(`${path}.profiles`, 'expected at least one profile')
  }

  const profiles: CameraProfile[] = rawProfiles.map((raw, i) => {
    const pp = `${path}.profiles[${i}]`
    const p = object(raw, pp)
    const profileId = string(p, 'id', pp)
    const profileName = string(p, 'name', pp)
    const profileInspiredBy = p.inspiredBy === undefined ? undefined : string(p, 'inspiredBy', pp)
    const look = decodePreset(
      {
        ...(mergeJSON(base, p.look === undefined ? {} : object(p.look, `${pp}.look`)) as Json),
        id: `${id}/${profileId}`,
        name: rawProfiles.length > 1 ? `${name} · ${profileName}` : name,
        category,
        inspiredBy: profileInspiredBy ?? inspiredBy,
      },
      pp,
    )
    if (look.inspiredBy === undefined) delete look.inspiredBy
    const profile: CameraProfile = { id: profileId, name: profileName, look }
    if (profileInspiredBy !== undefined) profile.inspiredBy = profileInspiredBy
    if (p.notes !== undefined) profile.notes = string(p, 'notes', pp)
    return profile
  })
  const ids = profiles.map((p) => p.id)
  if (new Set(ids).size !== ids.length) fail(`${path}.profiles`, 'profile ids must be unique')

  const options: CameraOptions = {}
  if (c.options !== undefined) {
    const o = object(c.options, `${path}.options`)
    for (const key of Object.keys(o)) {
      if (!cameraToggles.some((t) => t.id === key)) fail(`${path}.options.${key}`, 'unknown option')
      options[key as CameraToggle] = boolean(o, key, `${path}.options`, false)
    }
  }
  for (const profile of profiles) {
    const look = profile.look
    if (options.frame !== undefined && !look.frame) fail(`${path}.options.frame`, 'needs a frame')
    if (options.jitter !== undefined && !look.frame) fail(`${path}.options.jitter`, 'needs a frame')
    if (options.lightLeak !== undefined && !look.lightLeak)
      fail(`${path}.options.lightLeak`, 'needs a lightLeak')
  }

  const frameColors: FrameColor[] = []
  if (c.frameColors !== undefined) {
    if (!Array.isArray(c.frameColors)) fail(`${path}.frameColors`, 'expected an array')
    c.frameColors.forEach((raw, i) => {
      const f = object(raw, `${path}.frameColors[${i}]`)
      frameColors.push({
        name: string(f, 'name', `${path}.frameColors[${i}]`),
        color: string(f, 'color', `${path}.frameColors[${i}]`),
      })
    })
  }

  const camera: Camera = {
    id,
    name,
    category: profiles[0]!.look.category,
    profiles,
    options,
    frameColors,
  }
  if (inspiredBy !== undefined) camera.inspiredBy = inspiredBy
  return camera
}

/** A camera and what to pick on it, found from a stored or linked id. */
export interface CameraSelection {
  camera: Camera
  choice: CameraChoice
}

/** All cameras bundled with the app. */
export class CameraLibrary {
  private resolved = new Map<string, FilmPreset>()

  constructor(
    readonly cameras: readonly Camera[],
    /** Old preset ids and other names for a "camera/profile". */
    readonly aliases: Readonly<Record<string, string>> = {},
  ) {}

  /** Decodes a `{"cameras": [...], "aliases": {...}}` document. */
  static decode(value: unknown): CameraLibrary {
    const file = object(value, 'file')
    if (!Array.isArray(file.cameras)) fail('file.cameras', 'expected an array')
    const cameras = file.cameras.map((c, i) => decodeCamera(c, `cameras[${i}]`))
    const ids = cameras.map((c) => c.id)
    if (new Set(ids).size !== ids.length) fail('file.cameras', 'camera ids must be unique')
    const aliases: Record<string, string> = {}
    if (file.aliases !== undefined) {
      const a = object(file.aliases, 'file.aliases')
      for (const key of Object.keys(a)) aliases[key] = string(a, key, 'file.aliases')
    }
    const library = new CameraLibrary(cameras, aliases)
    for (const [alias, target] of Object.entries(aliases)) {
      if (!library.find(target)) fail(`file.aliases.${alias}`, `no camera "${target}"`)
    }
    return library
  }

  camerasIn(category: PresetCategory): Camera[] {
    return this.cameras.filter((c) => c.category === category)
  }

  camera(id: string): Camera | undefined {
    return this.cameras.find((c) => c.id === id)
  }

  /** Every profile of every camera with its default options, e.g. for a contact sheet. */
  get looks(): FilmPreset[] {
    return this.cameras.flatMap((camera) =>
      camera.profiles.map((p) => this.resolve(camera, this.defaultChoice(camera, p.id))),
    )
  }

  defaultChoice(camera: Camera, profileId?: string): CameraChoice {
    const o = camera.options
    return {
      profile: camera.profiles.find((p) => p.id === profileId)?.id ?? camera.profiles[0]!.id,
      frame: o.frame ?? false,
      lightLeak: o.lightLeak ?? false,
      dateStamp: o.dateStamp ?? false,
      jitter: o.jitter ?? false,
      frameColor: camera.frameColors[0]?.name ?? '',
    }
  }

  /** Finds a camera id, a "camera/profile" id or an alias such as an old preset id. */
  find(id: string): CameraSelection | undefined {
    const target = this.aliases[id] ?? id
    const [cameraId, profileId] = target.split('/')
    const camera = this.camera(cameraId ?? '')
    if (!camera) return undefined
    if (profileId !== undefined && !camera.profiles.some((p) => p.id === profileId)) {
      return undefined
    }
    return { camera, choice: this.defaultChoice(camera, profileId) }
  }

  /**
   * The look to render for a camera and choice. The same choice always gives the same object,
   * so its color LUT is only built once.
   */
  resolve(camera: Camera, choice: CameraChoice): FilmPreset {
    const profile = camera.profiles.find((p) => p.id === choice.profile) ?? camera.profiles[0]!
    const o = camera.options
    const frameColor =
      camera.frameColors.find((c) => c.name === choice.frameColor) ?? camera.frameColors[0]
    const key = [
      camera.id,
      profile.id,
      o.frame === undefined || choice.frame,
      o.lightLeak === undefined || choice.lightLeak,
      o.dateStamp === undefined ? '' : choice.dateStamp,
      o.jitter === undefined ? '' : choice.jitter,
      frameColor?.name ?? '',
    ].join('|')
    let look = this.resolved.get(key)
    if (look) return look

    look = { ...profile.look }
    if (o.frame !== undefined && !choice.frame) delete look.frame
    else if (look.frame && frameColor) look.frame = { ...look.frame, color: frameColor.color }
    if (o.lightLeak !== undefined && !choice.lightLeak) delete look.lightLeak
    if (o.dateStamp !== undefined) look.dateStamp = choice.dateStamp
    if (o.jitter !== undefined) look.jitter = choice.jitter
    if (!look.frame) look.jitter = false
    this.resolved.set(key, look)
    return look
  }

  /** The look for a camera, "camera/profile" or alias id, with default options. */
  look(id: string): FilmPreset | undefined {
    const found = this.find(id)
    return found && this.resolve(found.camera, found.choice)
  }
}

export const cameraLibrary = CameraLibrary.decode(camerasFile)

export const defaultCameraId = 'slr-35'
export const defaultEditorCameraId = 'clean'

export function selectionOrDefault(
  id: string | null | undefined,
  fallbackId: string,
): CameraSelection {
  return (
    cameraLibrary.find(id ?? '') ??
    cameraLibrary.find(fallbackId) ??
    cameraLibrary.find(cameraLibrary.cameras[0]!.id)!
  )
}

/** Makes sure a stored choice still fits the camera, e.g. after a profile was removed. */
export function validChoice(camera: Camera, value: unknown): CameraChoice {
  const fallback = cameraLibrary.defaultChoice(camera)
  if (typeof value !== 'object' || value === null) return fallback
  const v = value as Partial<Record<keyof CameraChoice, unknown>>
  const flag = (key: CameraToggle) => (typeof v[key] === 'boolean' ? v[key] : fallback[key])
  return {
    profile: camera.profiles.some((p) => p.id === v.profile)
      ? (v.profile as string)
      : fallback.profile,
    frame: flag('frame'),
    lightLeak: flag('lightLeak'),
    dateStamp: flag('dateStamp'),
    jitter: flag('jitter'),
    frameColor: camera.frameColors.some((c) => c.name === v.frameColor)
      ? (v.frameColor as string)
      : fallback.frameColor,
  }
}
