/**
 * A synthetic scene with sky, foliage, skin tones, a bright light and a gray ramp,
 * so every part of the pipeline has something to work on.
 */
export function drawTestScene(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.55)
  sky.addColorStop(0, '#2f6fb8')
  sky.addColorStop(1, '#a9cbe8')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height * 0.55)

  const ground = ctx.createLinearGradient(0, height * 0.55, 0, height)
  ground.addColorStop(0, '#4f7a32')
  ground.addColorStop(1, '#22361a')
  ctx.fillStyle = ground
  ctx.fillRect(0, height * 0.55, width, height * 0.45)

  // A bright lamp for halation and bloom.
  const s = Math.min(width, height)
  ctx.fillStyle = '#fffbea'
  ctx.beginPath()
  ctx.arc(width * 0.78, height * 0.2, s * 0.07, 0, Math.PI * 2)
  ctx.fill()

  // Skin-tone patches.
  const skins = ['#f1c7a6', '#d9a07b', '#a86b48', '#6b4029']
  skins.forEach((color, i) => {
    ctx.fillStyle = color
    ctx.fillRect(width * (0.08 + i * 0.11), height * 0.3, width * 0.09, height * 0.18)
  })

  // Saturated patches.
  const colors = ['#d62828', '#f77f00', '#fcbf49', '#2a9d8f', '#3a0ca3', '#e5e5e5']
  colors.forEach((color, i) => {
    ctx.fillStyle = color
    ctx.fillRect(width * (0.05 + i * 0.15), height * 0.62, width * 0.12, height * 0.14)
  })

  // A gray ramp from black to white.
  const ramp = ctx.createLinearGradient(0, 0, width, 0)
  ramp.addColorStop(0, '#000')
  ramp.addColorStop(1, '#fff')
  ctx.fillStyle = ramp
  ctx.fillRect(0, height * 0.82, width, height * 0.1)
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
