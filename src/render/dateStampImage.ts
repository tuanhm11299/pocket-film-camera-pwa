export const stampColor = 'rgb(255, 140, 31)'

/** Which of the seven segments each digit lights: a b c d e f g. */
const digitSegments: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
}

/**
 * Draws the date imprint the way the cameras' LED displays did: slanted seven-segment
 * digits with a soft glow. The canvas includes padding around the glyphs.
 */
export function drawDateStamp(
  text: string,
  fontSize: number,
  color: string = stampColor,
): HTMLCanvasElement {
  const h = fontSize
  const w = fontSize * 0.56
  const gap = fontSize * 0.22
  const t = fontSize * 0.12
  const slant = 0.12
  const widths = [...text].map((ch) => (ch in digitSegments ? w : ch === ' ' ? w * 0.6 : w * 0.35))
  const textWidth = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1) + slant * h

  const canvas = document.createElement('canvas')
  const padding = Math.ceil(fontSize * 0.3)
  canvas.width = Math.max(1, Math.ceil(textWidth + 2 * padding))
  canvas.height = Math.max(1, Math.ceil(h + 2 * padding))
  const ctx = canvas.getContext('2d')!

  const glyphs = () => {
    let x = padding
    ;[...text].forEach((ch, i) => {
      ctx.setTransform(1, 0, -slant, 1, x + slant * h, padding)
      const segments = digitSegments[ch]
      if (segments) {
        for (const s of segments) segment(ctx, s, w, h, t)
      } else if (ch === "'") {
        ctx.fillRect(w * 0.1, 0, t, h * 0.3)
      }
      x += widths[i]! + gap
    })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = fontSize * 0.3
  glyphs()
  ctx.shadowBlur = 0
  glyphs()
  return canvas
}

/** One segment as a long hexagon with pointed ends, in a `w`×`h` digit cell. */
function segment(ctx: CanvasRenderingContext2D, name: string, w: number, h: number, t: number) {
  const half = t / 2
  const inset = t * 0.6
  const horizontal = (y: number) => [inset, w - inset, y] as const
  const vertical = (x: number, top: boolean) =>
    [top ? inset : h / 2 + inset * 0.5, top ? h / 2 - inset * 0.5 : h - inset, x] as const
  let points: [number, number][]
  if ('adg'.includes(name)) {
    const [x0, x1, y] = horizontal(name === 'a' ? half : name === 'g' ? h / 2 : h - half)
    points = [
      [x0, y],
      [x0 + half, y - half],
      [x1 - half, y - half],
      [x1, y],
      [x1 - half, y + half],
      [x0 + half, y + half],
    ]
  } else {
    const left = name === 'e' || name === 'f'
    const top = name === 'b' || name === 'f'
    const [y0, y1, x] = vertical(left ? half : w - half, top)
    points = [
      [x, y0],
      [x + half, y0 + half],
      [x + half, y1 - half],
      [x, y1],
      [x - half, y1 - half],
      [x - half, y0 + half],
    ]
  }
  ctx.beginPath()
  ctx.moveTo(...points[0]!)
  for (const p of points.slice(1)) ctx.lineTo(...p)
  ctx.closePath()
  ctx.fill()
}
