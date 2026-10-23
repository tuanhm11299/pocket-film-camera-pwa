import type { FilmPreset } from '@/presets/types'
import { makeThumbnail } from '@/photo/thumbnail'
import { FilmRenderer, type RenderSource } from './FilmRenderer'
import { fitRenderSize, photoSize, pictureAspect } from './geometry'
import type { RenderOptions } from './renderOptions'

export const jpegQuality = 0.9

export interface EncodedPhoto {
  blob: Blob
  thumbnail: Blob
  width: number
  height: number
}

let exportRenderer: FilmRenderer | undefined
let queue: Promise<unknown> = Promise.resolve()

function renderer(): FilmRenderer {
  if (!exportRenderer || exportRenderer.isContextLost) {
    exportRenderer = new FilmRenderer(document.createElement('canvas'), {
      preserveDrawingBuffer: true,
    })
  }
  return exportRenderer
}

/**
 * Renders a preset onto the source at full resolution, cropped to the preset's shape and
 * with its frame, and encodes it as JPEG, plus a small thumbnail. Very large photos are
 * scaled down to what the browser's canvas and GPU can hold. Calls run one at a time, since
 * they share one canvas.
 *
 * With `matchOrientation`, a landscape source gets the preset's shape turned sideways.
 */
export function encodePhoto(
  preset: FilmPreset,
  source: RenderSource,
  options: RenderOptions,
  { matchOrientation = false } = {},
): Promise<EncodedPhoto> {
  const run = queue.then(async () => {
    const r = renderer()
    const aspect = pictureAspect(preset.aspect, source.width, source.height, matchOrientation)
    const full = photoSize(aspect, preset.frame, source.width, source.height)
    const { width, height } = fitRenderSize(full.width, full.height, r.maxTextureSize)
    if (!r.render(preset, source, options, width, height)) {
      throw new Error('The photo could not be rendered.')
    }
    const thumbnail = await makeThumbnail(r.canvas, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      r.canvas.toBlob(resolve, 'image/jpeg', jpegQuality),
    )
    if (!blob) throw new Error('The photo could not be encoded.')
    return { blob, thumbnail, width, height }
  })
  queue = run.catch(() => undefined)
  return run
}
