import type { FrameSettings } from '@/presets/types'
import type { Rect } from './geometry'

const edgePrintColor = 'rgb(232, 163, 61)'
const edgeFont = (size: number) => `bold ${size}px "Helvetica Neue", Arial, sans-serif`

/**
 * Draws a frame around `picture`: an instant print's paper, a strip of 35mm or 120 film,
 * or a slide mount. The picture's area is transparent, with rounded corners where the real
 * thing has them.
 */
export function drawFrame(
  frame: FrameSettings,
  width: number,
  height: number,
  picture: Rect,
  frameNumber: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const s = Math.min(picture.width, picture.height)

  switch (frame.style) {
    case 'instax-mini':
    case 'instax-square':
    case 'instant-white':
      paper(ctx, frame.color, width, height)
      cutWindow(ctx, picture, 0)
      // The print's picture sits a little below the paper surface.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)'
      ctx.lineWidth = Math.max(1, s * 0.004)
      ctx.strokeRect(picture.x, picture.y, picture.width, picture.height)
      break
    case 'film-35':
      ctx.fillStyle = frame.color
      ctx.fillRect(0, 0, width, height)
      cutWindow(ctx, picture, s * 0.012)
      filmStrip35(ctx, frame, width, height, picture, frameNumber)
      break
    case 'film-120':
      ctx.fillStyle = frame.color
      ctx.fillRect(0, 0, width, height)
      cutWindow(ctx, picture, s * 0.006)
      edgePrint120(ctx, frame, width, height, picture, frameNumber)
      break
    case 'slide-mount':
      paper(ctx, frame.color, width, height)
      cutWindow(ctx, picture, s * 0.05)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)'
      ctx.lineWidth = Math.max(1, s * 0.006)
      roundRect(ctx, picture, s * 0.05)
      ctx.stroke()
      ctx.fillStyle = 'rgba(60, 56, 50, 0.8)'
      ctx.font = edgeFont(Math.max(6, s * 0.045))
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        `${frame.text || 'PF CHROME'}  ·  ${frameNumber}`,
        width / 2,
        (picture.y + picture.height + height) / 2,
      )
      break
  }
  return canvas
}

function paper(ctx: CanvasRenderingContext2D, color: string, width: number, height: number) {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  // A faint sheen, lighter at the top.
  const sheen = ctx.createLinearGradient(0, 0, 0, height)
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.08)')
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.06)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, width, height)
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function' && radius > 0) {
    ctx.roundRect(r.x, r.y, r.width, r.height, radius)
  } else {
    ctx.rect(r.x, r.y, r.width, r.height)
  }
}

function cutWindow(ctx: CanvasRenderingContext2D, picture: Rect, radius: number) {
  ctx.save()
  // Erases as much as the fill covers, so it must be opaque.
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000'
  roundRect(ctx, picture, radius)
  ctx.fill()
  ctx.restore()
}

/**
 * Sprocket holes and edge print. The film runs along the picture's long side; sizes are in
 * millimeters of real 35mm film, where the picture's short edge is 24 mm.
 */
function filmStrip35(
  ctx: CanvasRenderingContext2D,
  frame: FrameSettings,
  width: number,
  height: number,
  picture: Rect,
  frameNumber: number,
) {
  const vertical = picture.width <= picture.height
  const mm = Math.min(picture.width, picture.height) / 24
  const length = vertical ? height : width
  const across = vertical ? width : height
  const pitch = 4.75 * mm
  const holeAlong = 1.98 * mm
  const holeAcross = 2.79 * mm
  const fromEdge = 2.0 * mm
  // Draw in film coordinates: x along the film, y across it.
  ctx.save()
  if (vertical) ctx.setTransform(0, 1, -1, 0, width, 0)
  ctx.fillStyle = 'rgb(222, 219, 210)'
  const phase = ((frameNumber * 0.37) % 1) * pitch
  for (let x = phase - pitch; x < length + pitch; x += pitch) {
    for (const y of [fromEdge, across - fromEdge - holeAcross]) {
      roundRect(ctx, { x, y, width: holeAlong, height: holeAcross }, 0.5 * mm)
      ctx.fill()
    }
  }
  ctx.fillStyle = edgePrintColor
  ctx.font = edgeFont(Math.max(5, 1.3 * mm))
  ctx.textBaseline = 'middle'
  const band = across - 1.0 * mm
  ctx.fillText(frame.text || 'PF 400', length * 0.12, band)
  ctx.fillText(`▸ ${frameNumber}A`, length * 0.62, band)
  ctx.fillText(`${frameNumber}`, length * 0.4, 1.0 * mm)
  ctx.restore()
}

function edgePrint120(
  ctx: CanvasRenderingContext2D,
  frame: FrameSettings,
  width: number,
  height: number,
  picture: Rect,
  frameNumber: number,
) {
  const vertical = picture.width <= picture.height
  const s = Math.min(picture.width, picture.height)
  ctx.save()
  ctx.fillStyle = edgePrintColor
  ctx.font = edgeFont(Math.max(5, s * 0.032))
  ctx.textBaseline = 'middle'
  if (vertical) {
    // The wide border is on the right; text runs down it.
    ctx.setTransform(0, 1, -1, 0, width, 0)
    const y = (width - picture.x - picture.width) / 2
    ctx.fillText(frame.text || 'PF 120', height * 0.1, y)
    ctx.fillText(`${frameNumber} ▸`, height * 0.75, y)
  } else {
    const y = (picture.y + picture.height + height) / 2
    ctx.fillText(frame.text || 'PF 120', width * 0.1, y)
    ctx.fillText(`${frameNumber} ▸`, width * 0.8, y)
  }
  ctx.restore()
}
