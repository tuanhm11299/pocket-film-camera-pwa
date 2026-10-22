// Exposes the renderer to the Playwright tests. Only built with `vite build --mode test`.
import { decodePreset, presetLibrary } from '@/presets/library'
import type { FilmPreset } from '@/presets/types'
import { encodePhoto } from '@/render/encode'
import { FilmRenderer } from '@/render/FilmRenderer'
import { drawTestScene, solidImage } from './testScene'

let renderer: FilmRenderer | undefined

function getRenderer() {
  renderer ??= new FilmRenderer(document.createElement('canvas'), { preserveDrawingBuffer: true })
  return renderer
}

export interface RenderRequest {
  /** A bundled preset id, or a preset object in the presets.json format. */
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
    const found = presetLibrary.preset(preset)
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

async function encode(request: RenderRequest) {
  const src = source(request)
  const photo = await encodePhoto(resolvePreset(request.preset), src, {
    seed: 1n,
    date: new Date(),
  })
  const bitmap = await createImageBitmap(photo.blob)
  return { type: photo.blob.type, width: bitmap.width, height: bitmap.height }
}

/** Every preset on the test scene, labeled, as a PNG data URL. */
function contactSheet(cell = 360) {
  const presets = presetLibrary.presets
  const columns = 4
  const height = Math.round((cell * 3) / 4)
  const label = 28
  const sheet = document.createElement('canvas')
  sheet.width = columns * cell
  sheet.height = Math.ceil(presets.length / columns) * (height + label)
  const ctx = sheet.getContext('2d')!
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, sheet.width, sheet.height)
  const r = getRenderer()
  const scene = { image: drawTestScene(cell, height), width: cell, height }
  presets.forEach((preset, i) => {
    r.render(preset, scene, { seed: 7n, date: new Date('1998-10-12T12:00:00') }, cell, height)
    const x = (i % columns) * cell
    const y = Math.floor(i / columns) * (height + label)
    ctx.drawImage(r.canvas, x, y)
    ctx.fillStyle = '#fff'
    ctx.font = '16px sans-serif'
    ctx.fillText(`${preset.name} (${preset.category})`, x + 8, y + height + 20)
  })
  return sheet.toDataURL('image/png')
}

const harness = {
  render,
  encode,
  contactSheet,
  presetIds: () => presetLibrary.presets.map((p) => p.id),
  supported: () => FilmRenderer.isSupported(),
}

declare global {
  interface Window {
    harness: typeof harness
  }
}

window.harness = harness
document.body.dataset.ready = 'true'
