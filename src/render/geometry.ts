/** A rectangle in normalized source coordinates, origin at the top left. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export const fullCrop: CropRect = { x: 0, y: 0, width: 1, height: 1 }

/** The part of a `sourceWidth`×`sourceHeight` image that covers an output of the given size, centered. */
export function aspectFillCrop(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
): CropRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || outputWidth <= 0 || outputHeight <= 0)
    return fullCrop
  const scale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight)
  const width = outputWidth / scale / sourceWidth
  const height = outputHeight / scale / sourceHeight
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

/** iOS Safari refuses canvases larger than this many pixels. */
export const maxCanvasPixels = 16_777_216

/** The largest size, with the same shape, that a canvas and a texture can hold. */
export function fitRenderSize(
  width: number,
  height: number,
  maxSide: number,
  maxPixels = maxCanvasPixels,
): { width: number; height: number } {
  const scale = Math.min(
    1,
    maxSide / Math.max(width, height),
    Math.sqrt(maxPixels / (width * height)),
  )
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

/** Scales a size down so its long edge is at most `longEdge`. Never scales up. */
export function scaledToLongEdge(
  width: number,
  height: number,
  longEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
