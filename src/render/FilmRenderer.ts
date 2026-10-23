import type { FilmPreset } from '@/presets/types'
import { isIdentityColor } from '@/presets/types'
import { drawDateStamp } from './dateStampImage'
import { fullCrop, type CropRect } from './geometry'
import { grainTile, grainTileSize } from './grainTile'
import { cachedCubeData, defaultLUTDimension } from './lut'
import { dateStampText, type RenderOptions } from './renderOptions'
import { SplitMix64 } from './splitmix64'
import {
  blurShader,
  copyShader,
  edgeBlurShader,
  finishShader,
  glowShader,
  highlightShader,
  lightShader,
  sourceShader,
  vertexShader,
} from './gl/shaders'

export interface RenderSource {
  image: TexImageSource
  width: number
  height: number
  /** A video or other source whose pixels change between renders with the same `image`. */
  live?: boolean
}

interface Target {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
  width: number
  height: number
}

type ProgramName =
  'source' | 'copy' | 'highlight' | 'blur' | 'edgeBlur' | 'glow' | 'light' | 'finish'

const fragmentShaders: Record<ProgramName, string> = {
  source: sourceShader,
  copy: copyShader,
  highlight: highlightShader,
  blur: blurShader,
  edgeBlur: edgeBlurShader,
  glow: glowShader,
  light: lightShader,
  finish: finishShader,
}

/** Blurs are run at a lower resolution so that sigma stays at most this many texels. */
const maxBlurSigma = 6

export class RenderError extends Error {}

/**
 * Applies a `FilmPreset` to an image with WebGL2.
 *
 * The same pipeline serves the live viewfinder, the editor preview and full-resolution
 * photos: effect sizes are relative to the image's short edge, so all of them look alike.
 * The result is drawn into `canvas`, which is resized to the output size.
 */
export class FilmRenderer {
  readonly gl: WebGL2RenderingContext
  private programs = new Map<
    ProgramName,
    { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> }
  >()
  private vao: WebGLVertexArrayObject | null = null
  private sourceTexture: WebGLTexture | null = null
  private lastSource: TexImageSource | null = null
  private lutTexture: WebGLTexture | null = null
  private lutFor: FilmPreset['color'] | null = null
  private noiseTexture: WebGLTexture | null = null
  private stampTexture: WebGLTexture | null = null
  private stampKey = ''
  private stampSize = { width: 0, height: 0 }
  private pool = new Map<string, Target[]>()
  private inUse: Target[] = []
  private poolSize = ''
  private lost = false
  readonly maxTextureSize: number

  constructor(
    readonly canvas: HTMLCanvasElement = document.createElement('canvas'),
    { preserveDrawingBuffer = false } = {},
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer,
    })
    if (!gl) throw new RenderError('WebGL2 is not available')
    this.gl = gl
    this.maxTextureSize = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      ...(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array),
    )
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      this.lost = true
    })
    canvas.addEventListener('webglcontextrestored', () => {
      this.resetResources()
      this.lost = false
    })
  }

  static isSupported(): boolean {
    try {
      return !!document.createElement('canvas').getContext('webgl2')
    } catch {
      return false
    }
  }

  get isContextLost(): boolean {
    return this.lost || this.gl.isContextLost()
  }

  /**
   * Renders `preset` onto `crop` of `source` and draws it into the canvas at `width`×`height`.
   * Returns false when the context is lost and nothing was drawn.
   */
  render(
    preset: FilmPreset,
    source: RenderSource,
    options: RenderOptions,
    width: number,
    height: number,
    crop: CropRect = fullCrop,
  ): boolean {
    if (this.isContextLost || width < 1 || height < 1) return false
    const gl = this.gl
    width = Math.round(width)
    height = Math.round(height)
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    const sizeKey = `${width}x${height}`
    if (this.poolSize !== sizeKey) {
      this.clearPool()
      this.poolSize = sizeKey
    }
    if (!this.vao) this.vao = gl.createVertexArray()
    gl.bindVertexArray(this.vao)
    gl.disable(gl.BLEND)

    const shortEdge = Math.min(width, height)

    // 1. Crop, scale, lens, this shot's exposure, and color.
    const useLUT = !isIdentityColor(preset.color)
    let current = this.acquire(width, height)
    this.uploadSource(source)
    const lens = preset.lens
    const k = 0.25 * Math.min(Math.max(lens.distortion, -1), 1)
    // Barrel distortion pulls the corners in, pincushion pushes the middle of the edges out;
    // scale so the image still fills the frame.
    const nearestEdge = Math.min(width, height) / Math.hypot(width, height)
    const distortionScale = k >= 0 ? 1 + k : 1 + k * nearestEdge * nearestEdge
    this.run('source', current, {
      u_source: [0, this.sourceTexture!],
      u_crop: [crop.x, crop.y, crop.width, crop.height],
      u_size: [width, height],
      u_distortion: k,
      u_distortionScale: distortionScale,
      u_aberration: 0.012 * Math.min(Math.max(lens.chromaticAberration, 0), 1),
      u_gain: shotGain(preset, options.seed),
      u_useLUT: useLUT,
      // Always bind the 3D sampler to its own unit: samplers of different types may not share one.
      u_lut: [1, useLUT ? this.lut(preset.color) : null, gl.TEXTURE_3D],
      u_lutSize: defaultLUTDimension,
    })

    // 2. Edge blur: a lens that is soft away from the center.
    if (lens.edgeBlur > 0) {
      const amount = Math.min(lens.edgeBlur, 1)
      const blurred = this.blur(current, shortEdge * (0.003 + 0.009 * amount))
      const next = this.acquire(width, height)
      this.run('edgeBlur', next, {
        u_source: [0, current.texture],
        u_blurred: [1, blurred.texture],
        u_size: [width, height],
        u_amount: Math.min(1, 0.5 + amount),
      })
      this.release(blurred)
      this.release(current)
      current = next
    }

    // 3. Halation: a red-orange glow around bright highlights, tight near them and wider
    // further out, from light scattering back through the film base.
    if (preset.halation && preset.halation.intensity > 0) {
      const h = preset.halation
      const amount = Math.min(h.intensity, 1)
      const highlights = this.acquire(width, height)
      this.run('highlight', highlights, {
        u_source: [0, current.texture],
        u_threshold: h.threshold,
      })
      const tight = this.blur(highlights, shortEdge * 0.008 * h.radius)
      this.release(highlights)
      current = this.glow(
        current,
        tight,
        h.color.map((c) => 0.7 * c * amount),
      )
      const wide = this.blur(tight, shortEdge * 0.02 * h.radius)
      this.release(tight)
      current = this.glow(
        current,
        wide,
        h.color.map((c) => 0.6 * c * amount),
      )
      this.release(wide)
    }

    // 4. Bloom: a soft white glow around bright areas.
    if (preset.bloom && preset.bloom.intensity > 0) {
      const b = preset.bloom
      const highlights = this.acquire(width, height)
      this.run('highlight', highlights, {
        u_source: [0, current.texture],
        u_threshold: b.threshold,
      })
      const glow = this.blur(highlights, shortEdge * 0.035 * b.radius)
      this.release(highlights)
      const amount = 0.8 * Math.min(b.intensity, 1)
      current = this.glow(current, glow, [amount, amount, amount])
      this.release(glow)
    }

    // 5. Softness: the glow of a cheap plastic lens.
    if (preset.softness > 0) {
      const glow = this.blur(current, shortEdge * 0.02)
      const k = 0.8 * Math.min(preset.softness, 1)
      current = this.glow(current, glow, [k, k, k])
      this.release(glow)
    }

    // 6. Flash, vignette and light leak.
    const leak = preset.lightLeak && preset.lightLeak.intensity > 0 ? preset.lightLeak : undefined
    const leakUniforms = leak ? lightLeakUniforms(leak, options.seed, width, height) : undefined
    if (preset.flash > 0 || preset.vignette > 0 || leakUniforms) {
      const next = this.acquire(width, height)
      this.run('light', next, {
        u_source: [0, current.texture],
        u_size: [width, height],
        u_flash: Math.min(preset.flash, 1),
        u_flashColor: [...preset.flashColor],
        u_vignette: Math.min(preset.vignette, 1),
        u_leak: !!leakUniforms,
        ...leakUniforms,
      })
      this.release(current)
      current = next
    }

    // 7–8. Grain and date stamp, drawn straight into the canvas.
    const uniforms: Uniforms = {
      u_source: [0, current.texture],
      u_size: [width, height],
      u_grain: false,
      u_stamp: false,
    }
    if (preset.grain && preset.grain.intensity > 0) {
      const g = preset.grain
      // Grain is sized relative to the image. When a grain is smaller than a pixel, as in the
      // viewfinder, it is weaker instead, the way a full-size photo looks when shrunk to fit.
      const relative = (shortEdge / 1500) * g.size
      const scale = Math.max(1, relative)
      // Each seed starts the tile at a different spot.
      const rng = new SplitMix64(options.seed)
      const offsetX = rng.nextInt(grainTileSize) * scale
      const offsetY = rng.nextInt(grainTileSize) * scale
      Object.assign(uniforms, {
        u_grain: true,
        u_noise: [1, this.noise()],
        u_noiseOffset: [offsetX, offsetY],
        u_noiseScale: scale,
        u_grainAmount: Math.min(g.intensity, 1) * 1.5 * Math.min(1, relative),
        u_grainChroma: preset.color.monochrome ? 0 : Math.min(Math.max(g.chroma, 0), 1),
        u_grainRoughness: Math.min(Math.max(g.roughness, 0), 1),
        u_grainResponse: [...g.response],
      })
    }
    if (preset.dateStamp) {
      const fontSize = Math.max(shortEdge * 0.045, 8)
      const stamp = this.stamp(dateStampText(options.date), fontSize)
      const margin = shortEdge * 0.05
      Object.assign(uniforms, {
        u_stamp: true,
        u_stampTexture: [2, stamp],
        u_stampRect: [
          width - margin - this.stampSize.width,
          margin,
          this.stampSize.width,
          this.stampSize.height,
        ],
      })
    }
    this.run('finish', null, uniforms, width, height)
    this.release(current)
    this.releaseAll()
    return true
  }

  /** The canvas pixels, bottom row first, as RGBA. Call right after `render`. */
  readPixels(): Uint8Array {
    const gl = this.gl
    const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    return pixels
  }

  dispose() {
    this.resetResources()
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  // MARK: - Passes

  private blur(source: Target, sigma: number): Target {
    // Halve the resolution until sigma is small enough for a short kernel.
    let current = source
    let s = sigma
    let owned = false
    while (s > maxBlurSigma && current.width > 8 && current.height > 8) {
      const half = this.acquire(Math.ceil(current.width / 2), Math.ceil(current.height / 2))
      this.run('copy', half, { u_source: [0, current.texture] })
      if (owned) this.release(current)
      current = half
      owned = true
      s /= 2
    }
    s = Math.max(s, 0.5)
    const radius = Math.min(48, Math.ceil(s * 3))
    const horizontal = this.acquire(current.width, current.height)
    this.run('blur', horizontal, {
      u_source: [0, current.texture],
      u_step: [1 / current.width, 0],
      u_sigma: s,
      u_radius: radius,
    })
    if (owned) this.release(current)
    const vertical = this.acquire(horizontal.width, horizontal.height)
    this.run('blur', vertical, {
      u_source: [0, horizontal.texture],
      u_step: [0, 1 / horizontal.height],
      u_sigma: s,
      u_radius: radius,
    })
    this.release(horizontal)
    return vertical
  }

  private glow(base: Target, glow: Target, tint: number[]): Target {
    const next = this.acquire(base.width, base.height)
    this.run('glow', next, { u_source: [0, base.texture], u_glow: [1, glow.texture], u_tint: tint })
    this.release(base)
    return next
  }

  private run(
    name: ProgramName,
    target: Target | null,
    uniforms: Uniforms,
    width?: number,
    height?: number,
  ) {
    const gl = this.gl
    const { program, uniforms: locations } = this.program(name)
    gl.useProgram(program)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null)
    gl.viewport(0, 0, target?.width ?? width!, target?.height ?? height!)
    for (const [key, value] of Object.entries(uniforms)) {
      let location = locations.get(key)
      if (location === undefined) {
        location = gl.getUniformLocation(program, key)
        locations.set(key, location)
      }
      if (location === null) continue
      if (typeof value === 'boolean') {
        gl.uniform1i(location, value ? 1 : 0)
      } else if (typeof value === 'number') {
        if (key === 'u_radius') gl.uniform1i(location, value)
        else gl.uniform1f(location, value)
      } else if (isTextureBinding(value)) {
        const [unit, texture, kind = gl.TEXTURE_2D] = value
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(kind, texture)
        gl.uniform1i(location, unit)
      } else {
        const v = value as number[]
        if (v.length === 2) gl.uniform2fv(location, v)
        else if (v.length === 3) gl.uniform3fv(location, v)
        else gl.uniform4fv(location, v)
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  // MARK: - Resources

  private program(name: ProgramName) {
    let entry = this.programs.get(name)
    if (entry) return entry
    const gl = this.gl
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new RenderError(`${name} shader: ${gl.getShaderInfoLog(shader)}`)
      }
      return shader
    }
    const program = gl.createProgram()
    const vs = compile(gl.VERTEX_SHADER, vertexShader)
    const fs = compile(gl.FRAGMENT_SHADER, fragmentShaders[name])
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new RenderError(`${name} program: ${gl.getProgramInfoLog(program)}`)
    }
    entry = { program, uniforms: new Map() }
    this.programs.set(name, entry)
    return entry
  }

  private createTexture(kind: number = this.gl.TEXTURE_2D, wrap: number = this.gl.CLAMP_TO_EDGE) {
    const gl = this.gl
    const texture = gl.createTexture()
    gl.bindTexture(kind, texture)
    gl.texParameteri(kind, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(kind, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(kind, gl.TEXTURE_WRAP_S, wrap)
    gl.texParameteri(kind, gl.TEXTURE_WRAP_T, wrap)
    if (kind === gl.TEXTURE_3D) gl.texParameteri(kind, gl.TEXTURE_WRAP_R, wrap)
    return texture
  }

  private uploadSource(source: RenderSource) {
    const gl = this.gl
    if (!this.sourceTexture) this.sourceTexture = this.createTexture()
    if (this.lastSource === source.image && !source.live) return
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, source.image)
    this.lastSource = source.image
  }

  private lut(settings: FilmPreset['color']): WebGLTexture {
    const gl = this.gl
    if (!this.lutTexture) this.lutTexture = this.createTexture(gl.TEXTURE_3D)
    if (this.lutFor !== settings) {
      const n = defaultLUTDimension
      gl.bindTexture(gl.TEXTURE_3D, this.lutTexture)
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        gl.RGBA16F,
        n,
        n,
        n,
        0,
        gl.RGBA,
        gl.FLOAT,
        cachedCubeData(settings),
      )
      this.lutFor = settings
    }
    return this.lutTexture!
  }

  private noise(): WebGLTexture {
    const gl = this.gl
    if (!this.noiseTexture) {
      this.noiseTexture = this.createTexture(gl.TEXTURE_2D, gl.REPEAT)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      // Plain RGB8, no color space: the values are used as-is, so mid-gray stays exactly neutral.
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB8,
        grainTileSize,
        grainTileSize,
        0,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        grainTile(),
      )
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    }
    return this.noiseTexture
  }

  private stamp(text: string, fontSize: number): WebGLTexture {
    const gl = this.gl
    if (!this.stampTexture) this.stampTexture = this.createTexture()
    const key = `${text}@${fontSize.toFixed(2)}`
    if (this.stampKey !== key) {
      const canvas = drawDateStamp(text, fontSize)
      gl.bindTexture(gl.TEXTURE_2D, this.stampTexture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      this.stampKey = key
      this.stampSize = { width: canvas.width, height: canvas.height }
    }
    return this.stampTexture!
  }

  private acquire(width: number, height: number): Target {
    const key = `${width}x${height}`
    let target = this.pool.get(key)?.pop()
    if (!target) {
      const gl = this.gl
      const texture = this.createTexture()!
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.SRGB8_ALPHA8, width, height)
      const framebuffer = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      target = { texture, framebuffer, width, height }
    }
    this.inUse.push(target)
    return target
  }

  private release(target: Target) {
    const index = this.inUse.indexOf(target)
    if (index < 0) return
    this.inUse.splice(index, 1)
    const key = `${target.width}x${target.height}`
    const free = this.pool.get(key) ?? []
    free.push(target)
    this.pool.set(key, free)
  }

  private releaseAll() {
    for (const target of [...this.inUse]) this.release(target)
  }

  private clearPool() {
    const gl = this.gl
    this.releaseAll()
    for (const targets of this.pool.values()) {
      for (const t of targets) {
        gl.deleteTexture(t.texture)
        gl.deleteFramebuffer(t.framebuffer)
      }
    }
    this.pool.clear()
  }

  /** Forgets every GPU object, e.g. after the context was lost and restored. */
  private resetResources() {
    const gl = this.gl
    if (!gl.isContextLost()) {
      this.clearPool()
      for (const { program } of this.programs.values()) gl.deleteProgram(program)
      for (const t of [this.sourceTexture, this.lutTexture, this.noiseTexture, this.stampTexture]) {
        if (t) gl.deleteTexture(t)
      }
      if (this.vao) gl.deleteVertexArray(this.vao)
    }
    this.pool.clear()
    this.inUse = []
    this.poolSize = ''
    this.programs.clear()
    this.vao = null
    this.sourceTexture = null
    this.lastSource = null
    this.lutTexture = null
    this.lutFor = null
    this.noiseTexture = null
    this.stampTexture = null
    this.stampKey = ''
  }
}

/** This shot's exposure and white balance change, as a linear gain per channel. */
function shotGain(preset: FilmPreset, seed: bigint): number[] {
  const { exposure, temperature } = preset.variation
  if (exposure === 0 && temperature === 0) return [1, 1, 1]
  const rng = new SplitMix64(seed ^ 0x56415259n)
  const stops = rng.nextDouble(-exposure, exposure)
  const warmth = rng.nextDouble(-temperature, temperature)
  const gain = Math.pow(2, stops)
  return [gain * (1 + 0.12 * warmth), gain, gain * (1 - 0.12 * warmth)]
}

/** One to three seeded glowing blobs along the left or right edge. */
function lightLeakUniforms(
  leak: NonNullable<FilmPreset['lightLeak']>,
  seed: bigint,
  width: number,
  height: number,
): Uniforms | undefined {
  const rng = new SplitMix64(seed ^ 0x4c45414bn)
  if (rng.nextDouble() >= leak.chance) return undefined
  const shortEdge = Math.min(width, height)
  const fromLeft = rng.nextBool()
  const count = 1 + rng.nextInt(3)
  const k = Math.min(leak.intensity, 1)
  const blobs: number[][] = []
  const strengths: number[] = []
  for (let i = 0; i < 3; i++) {
    const inset = shortEdge * rng.nextDouble(-0.15, 0.1)
    const x = fromLeft ? inset : width - inset
    const y = height * rng.nextDouble(0.1, 0.9)
    // Leaks come in through the film's edge, so they are longer along it than across.
    const across = shortEdge * rng.nextDouble(0.25, 0.6)
    const along = shortEdge * rng.nextDouble(0.4, 1.1)
    blobs.push([x, y, across, along])
    strengths.push(i < count ? k * rng.nextDouble(0.6, 1.2) : 0)
  }
  return {
    u_leak0: blobs[0]!,
    u_leak1: blobs[1]!,
    u_leak2: blobs[2]!,
    u_leakStrength: strengths,
    u_leakColor: [...leak.color],
    u_leakEdgeColor: [...leak.edgeColor],
  }
}

type TextureBinding = [unit: number, texture: WebGLTexture | null, kind?: number]
type Uniforms = Record<string, boolean | number | number[] | TextureBinding>

function isTextureBinding(value: unknown): value is TextureBinding {
  return Array.isArray(value) && value.length >= 2 && typeof value[1] === 'object'
}
