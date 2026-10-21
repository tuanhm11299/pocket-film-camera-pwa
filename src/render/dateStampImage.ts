export const stampColor = 'rgb(255, 140, 31)'

const font = (size: number) =>
  `bold ${size}px ui-monospace, Menlo, "DejaVu Sans Mono", "Courier New", monospace`

/**
 * Draws the orange date imprint, with a soft glow like the real thing.
 * The canvas includes padding around the glyphs.
 */
export function drawDateStamp(text: string, fontSize: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = font(fontSize)
  const m = ctx.measureText(text)
  const left = m.actualBoundingBoxLeft
  const ascent = m.actualBoundingBoxAscent
  const width = left + m.actualBoundingBoxRight
  const height = ascent + m.actualBoundingBoxDescent
  const padding = Math.ceil(fontSize * 0.3)
  canvas.width = Math.max(1, Math.ceil(width + 2 * padding))
  canvas.height = Math.max(1, Math.ceil(height + 2 * padding))

  // Resizing the canvas resets its state.
  ctx.font = font(fontSize)
  ctx.fillStyle = stampColor
  ctx.shadowColor = stampColor
  ctx.shadowBlur = fontSize * 0.24
  ctx.fillText(text, padding + left, padding + ascent)
  ctx.shadowBlur = 0
  ctx.fillText(text, padding + left, padding + ascent)
  return canvas
}
