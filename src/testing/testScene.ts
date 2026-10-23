/** The 24 patches of a ColorChecker chart, in sRGB, row by row. */
export const colorChecker = [
  ['#735244', '#c29682', '#627a9d', '#576c43', '#8580b1', '#67bdaa'],
  ['#d67e2c', '#505ba6', '#c15a63', '#5e3c6c', '#9dbc40', '#e0a32e'],
  ['#383d96', '#469449', '#af363c', '#e7c71f', '#bb5695', '#0885a1'],
  ['#f3f3f2', '#c8c8c8', '#a0a0a0', '#7a7a79', '#555555', '#343434'],
]

/** A tiny deterministic generator, so the scene is the same every time. */
function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/**
 * A synthetic scene with a sky, clouds, a bright lamp, foliage, lit skin tones,
 * a ColorChecker chart and a gray ramp, so every part of the pipeline has something to
 * work on. It is laid out relative to its size, so it works at any shape.
 */
export function drawTestScene(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const s = Math.min(width, height)
  const rand = random(7)

  // Sky, deep blue at the top to pale at the horizon, with soft clouds.
  const horizon = height * 0.42
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#2a62ad')
  sky.addColorStop(1, '#b6d2ea')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, horizon)
  for (let i = 0; i < 14; i++) {
    const x = width * rand()
    const y = horizon * (0.15 + 0.6 * rand())
    const r = s * (0.05 + 0.08 * rand())
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, r)
    cloud.addColorStop(0, 'rgba(255, 255, 255, 0.55)')
    cloud.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = cloud
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
  }

  // A bright lamp with a glow, for halation and bloom.
  const lx = width * 0.82
  const ly = horizon * 0.35
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, s * 0.12)
  glow.addColorStop(0, 'rgba(255, 250, 230, 1)')
  glow.addColorStop(0.35, 'rgba(255, 245, 220, 1)')
  glow.addColorStop(1, 'rgba(255, 240, 210, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(lx - s * 0.12, ly - s * 0.12, s * 0.24, s * 0.24)

  // Foliage: many leaves in different greens, lit from above.
  const ground = height * 0.58
  ctx.fillStyle = '#26381c'
  ctx.fillRect(0, horizon, width, ground - horizon)
  const greens = ['#3f6b2a', '#5a8a35', '#2f5222', '#7ba046', '#486f30', '#94b65a']
  for (let i = 0; i < 900; i++) {
    const y = horizon + (ground - horizon) * rand()
    const light = 1 - (y - horizon) / (ground - horizon)
    ctx.globalAlpha = 0.5 + 0.5 * light
    ctx.fillStyle = greens[Math.floor(rand() * greens.length)]!
    ctx.beginPath()
    ctx.ellipse(width * rand(), y, s * 0.012, s * 0.006, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Lit spheres in three skin tones, standing in for faces.
  const skins = [
    ['#ffe3cf', '#e8b594', '#8a5a40'],
    ['#f0c4a0', '#c98c63', '#5e3722'],
    ['#b47a55', '#7d4c2f', '#2e1a10'],
  ]
  skins.forEach(([light, mid, dark], i) => {
    const cx = width * (0.2 + i * 0.22)
    const cy = horizon
    const r = s * 0.1
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.05, cx, cy, r)
    g.addColorStop(0, light!)
    g.addColorStop(0.5, mid!)
    g.addColorStop(1, dark!)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  })

  // The ColorChecker chart.
  const chartTop = ground + height * 0.02
  const chartHeight = height * 0.26
  const cellW = width / 6
  const cellH = chartHeight / 4
  ctx.fillStyle = '#111'
  ctx.fillRect(0, ground, width, height - ground)
  colorChecker.forEach((row, r) =>
    row.forEach((color, c) => {
      ctx.fillStyle = color
      ctx.fillRect(
        c * cellW + cellW * 0.06,
        chartTop + r * cellH + cellH * 0.06,
        cellW * 0.88,
        cellH * 0.88,
      )
    }),
  )

  // A gray ramp from black to white.
  const ramp = ctx.createLinearGradient(0, 0, width, 0)
  ramp.addColorStop(0, '#000')
  ramp.addColorStop(1, '#fff')
  ctx.fillStyle = ramp
  ctx.fillRect(0, height * 0.9, width, height * 0.07)
  return canvas
}

export function solidImage(width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  return canvas
}
