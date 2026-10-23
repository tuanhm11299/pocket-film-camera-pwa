// Exposes the renderer to the Playwright tests. Only built with `vite build --mode test`.
import { cameraLibrary, decodePreset } from '@/presets/library'
import type { FilmPreset } from '@/presets/types'
import { encodePhoto } from '@/render/encode'
import { FilmRenderer } from '@/render/FilmRenderer'
import { framedAspect } from '@/render/geometry'
import { drawTestScene, solidImage } from './testScene'

let renderer: FilmRenderer | undefined

function getRenderer() {
  renderer ??= new FilmRenderer(document.createElement('canvas'), { preserveDrawingBuffer: true })
  return renderer
}

export interface RenderRequest {
  /** A camera, "camera/profile" or old preset id, or a look object in the cameras.json format. */
  preset: string | Record<string, unknown>
  width?: number
  height?: number
  seed?: string
  date?: string
  /** A CSS color for a solid image instead of the test scene. */
  solid?: string
}

function resolvePreset(preset: RenderRequest['preset']): FilmPreset {
  if (typeof preset === 'string') {
    const found = cameraLibrary.look(preset)
    if (!found) throw new Error(`No preset ${preset}`)
    return found
  }
  return decodePreset(preset)
}

function source(request: RenderRequest) {
  const width = request.width ?? 320
  const height = request.height ?? 240
  const image = request.solid
    ? solidImage(width, height, request.solid)
    : drawTestScene(width, height)
  return { image, width, height }
}

/** Renders and returns the pixels top row first, plus the source pixels for comparison. */
function render(request: RenderRequest) {
  const r = getRenderer()
  const src = source(request)
  const ok = r.render(
    resolvePreset(request.preset),
    src,
    { seed: BigInt(request.seed ?? '1'), date: new Date(request.date ?? '1998-10-12T12:00:00') },
    src.width,
    src.height,
  )
  if (!ok) throw new Error('render failed')
  const bottomUp = r.readPixels()
  const rowBytes = src.width * 4
  const pixels = new Uint8Array(bottomUp.length)
  for (let y = 0; y < src.height; y++) {
    pixels.set(
      bottomUp.subarray((src.height - 1 - y) * rowBytes, (src.height - y) * rowBytes),
      y * rowBytes,
    )
  }
  const original = src.image.getContext('2d')!.getImageData(0, 0, src.width, src.height).data
  return {
    width: r.canvas.width,
    height: r.canvas.height,
    pixels: Array.from(pixels),
    original: Array.from(original),
  }
}

/** Average milliseconds per render, waiting for the GPU to finish. */
function time(request: RenderRequest, runs = 5) {
  const r = getRenderer()
  const src = source(request)
  const preset = resolvePreset(request.preset)
  const options = { seed: 1n, date: new Date() }
  const pixel = new Uint8Array(4)
  // Reading one pixel waits for the GPU; finish() alone doesn't in every browser.
  const sync = () => r.gl.readPixels(0, 0, 1, 1, r.gl.RGBA, r.gl.UNSIGNED_BYTE, pixel)
  r.render(preset, src, options, src.width, src.height)
  sync()
  const start = performance.now()
  for (let i = 0; i < runs; i++) {
    r.render(preset, src, options, src.width, src.height)
    sync()
  }
  return (performance.now() - start) / runs
}

async function encode(request: RenderRequest) {
  const src = source(request)
  const photo = await encodePhoto(resolvePreset(request.preset), src, {
    seed: 1n,
    date: new Date(),
  })
  const bitmap = await createImageBitmap(photo.blob)
  return { type: photo.blob.type, width: bitmap.width, height: bitmap.height }
}

/** Every look, or the ones given, on the test scene, labeled, as a PNG data URL. */
function contactSheet(cell = 360, ids?: string[]) {
  const presets = ids ? ids.map((id) => resolvePreset(id)) : cameraLibrary.looks
  const columns = 4
  const box = Math.round(cell * 1.1)
  const label = 28
  const sheet = document.createElement('canvas')
  sheet.width = columns * cell
  sheet.height = Math.ceil(presets.length / columns) * (box + label)
  const ctx = sheet.getContext('2d')!
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, sheet.width, sheet.height)
  const r = getRenderer()
  presets.forEach((preset, i) => {
    // Each look at its own shape, frame included, as large as fits in its cell, on a scene
    // drawn at the picture's shape.
    const shape = preset.aspect ?? [3, 4]
    const aspect = framedAspect(shape, preset.frame)
    const width = Math.round(aspect > cell / box ? cell : box * aspect)
    const height = Math.round(width / aspect)
    const sceneWidth = Math.round(Math.sqrt((cell * cell * shape[0]) / shape[1]))
    const sceneHeight = Math.round((sceneWidth * shape[1]) / shape[0])
    const scene = {
      image: drawTestScene(sceneWidth, sceneHeight),
      width: sceneWidth,
      height: sceneHeight,
    }
    r.render(preset, scene, { seed: 7n, date: new Date('1998-10-12T12:00:00') }, width, height)
    const x = (i % columns) * cell
    const y = Math.floor(i / columns) * (box + label)
    ctx.drawImage(r.canvas, x + (cell - width) / 2, y + (box - height) / 2)
    ctx.fillStyle = '#fff'
    ctx.font = '15px sans-serif'
    ctx.fillText(preset.name, x + 8, y + box + 20)
  })
  return sheet.toDataURL('image/png')
}

const harness = {
  render,
  time,
  encode,
  contactSheet,
  presetIds: () => cameraLibrary.looks.map((p) => p.id),
  supported: () => FilmRenderer.isSupported(),
}

declare global {
  interface Window {
    harness: typeof harness
  }
}

window.harness = harness
document.body.dataset.ready = 'true'
