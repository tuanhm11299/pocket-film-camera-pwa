import type { FrameSettings } from '@/presets/types'

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

/** The crop of `crop` that covers an output with the given shape, centered. */
export function aspectFillWithin(
  crop: CropRect,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
): CropRect {
  const inner = aspectFillCrop(
    sourceWidth * crop.width,
    sourceHeight * crop.height,
    outputWidth,
    outputHeight,
  )
  return {
    x: crop.x + inner.x * crop.width,
    y: crop.y + inner.y * crop.height,
    width: inner.width * crop.width,
    height: inner.height * crop.height,
  }
}

/** A rectangle in pixels, origin at the top left. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Border widths around a picture, in units of the picture's short edge. */
export interface FrameInsets {
  left: number
  right: number
  top: number
  bottom: number
}

const uniform = (v: number): FrameInsets => ({ left: v, right: v, top: v, bottom: v })

/**
 * The borders of each frame style, from the real thing: an Instax Mini print is 54×86 mm
 * around a 46×62 mm picture, 35mm film has 5.5 mm of rebate with sprocket holes on each
 * side of a 24×36 mm frame, and so on. Film borders run along the picture's long sides.
 */
export function frameInsets(frame: FrameSettings | undefined, portrait: boolean): FrameInsets {
  switch (frame?.style) {
    case undefined:
      return uniform(0)
    case 'instax-mini':
      return { left: 0.087, right: 0.087, top: 0.13, bottom: 0.39 }
    case 'instax-square':
      return { left: 0.08, right: 0.08, top: 0.115, bottom: 0.29 }
    case 'instant-white':
      return { left: 0.06, right: 0.06, top: 0.075, bottom: 0.27 }
    case 'film-35':
      return portrait
        ? { left: 0.23, right: 0.23, top: 0.07, bottom: 0.07 }
        : { left: 0.07, right: 0.07, top: 0.23, bottom: 0.23 }
    case 'film-120':
      return portrait
        ? { left: 0.06, right: 0.11, top: 0.06, bottom: 0.06 }
        : { left: 0.06, right: 0.06, top: 0.06, bottom: 0.11 }
    case 'slide-mount':
      return uniform(0.26)
  }
}

function framedSizeExact(width: number, height: number, frame: FrameSettings | undefined) {
  const s = Math.min(width, height)
  const i = frameInsets(frame, width <= height)
  return {
    width: width + (i.left + i.right) * s,
    height: height + (i.top + i.bottom) * s,
  }
}

/** The size of a framed photo whose picture is `width`×`height`. */
export function framedSize(
  width: number,
  height: number,
  frame: FrameSettings | undefined,
): { width: number; height: number } {
  const size = framedSizeExact(width, height, frame)
  return { width: Math.round(size.width), height: Math.round(size.height) }
}

/** Width over height of a framed photo whose picture has the shape `aspect`. */
export function framedAspect(
  aspect: readonly [number, number],
  frame: FrameSettings | undefined,
): number {
  const size = framedSizeExact(aspect[0], aspect[1], frame)
  return size.width / size.height
}

/**
 * Where the picture goes in a framed photo of `width`×`height` pixels. A frame's size alone
 * can fit an upright or a sideways picture, so `pictureAspect` (width over height, either
 * way around) says which one is meant.
 */
export function pictureRect(
  width: number,
  height: number,
  frame: FrameSettings | undefined,
  pictureAspect = 1,
): Rect {
  if (!frame) return { x: 0, y: 0, width, height }
  const candidates = [true, false].map((portrait) => {
    const i = frameInsets(frame, portrait)
    // The picture's short edge is its width when upright, its height when sideways.
    const s = portrait ? width / (1 + i.left + i.right) : height / (1 + i.top + i.bottom)
    const pw = portrait ? s : width - (i.left + i.right) * s
    const ph = portrait ? height - (i.top + i.bottom) * s : s
    const ratio = Math.log(Math.max(pw, 1) / Math.max(ph, 1))
    const target = Math.abs(Math.log(pictureAspect))
    const fits = portrait ? pw <= ph : pw >= ph
    return { i, s, pw, ph, error: (fits ? 0 : 10) + Math.abs(Math.abs(ratio) - target) }
  })
  const { i, s, pw, ph } =
    candidates[0]!.error <= candidates[1]!.error ? candidates[0]! : candidates[1]!
  const x = Math.round(i.left * s)
  const y = Math.round(i.top * s)
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(pw))),
    height: Math.max(1, Math.min(height - y, Math.round(ph))),
  }
}

/**
 * The picture shape to use for a source: the look's own shape, turned to match the source's
 * orientation when `matchOrientation` is set, or the source's shape if the look has none.
 */
export function pictureAspect(
  aspect: readonly [number, number] | undefined,
  sourceWidth: number,
  sourceHeight: number,
  matchOrientation: boolean,
): [number, number] {
  if (!aspect) return [sourceWidth, sourceHeight]
  const [w, h] = aspect
  if (matchOrientation && w !== h && w > h !== sourceWidth > sourceHeight) return [h, w]
  return [w, h]
}

/** The output size for rendering a look onto a source at full resolution, with its frame. */
export function photoSize(
  aspect: readonly [number, number],
  frame: FrameSettings | undefined,
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  const crop = aspectFillCrop(sourceWidth, sourceHeight, aspect[0], aspect[1])
  return framedSize(sourceWidth * crop.width, sourceHeight * crop.height, frame)
}
