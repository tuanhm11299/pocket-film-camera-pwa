import { expect, test, type Page } from '@playwright/test'
import type {} from '../../src/testing/harness'

type RenderRequest = {
  preset: string | Record<string, unknown>
  width?: number
  height?: number
  seed?: string
  date?: string
  solid?: string
}

type Rendered = { width: number; height: number; pixels: number[]; original: number[] }

async function render(page: Page, request: RenderRequest): Promise<Rendered> {
  return page.evaluate((r) => window.harness.render(r), request)
}

/** The largest difference of any channel between two RGBA buffers, ignoring alpha. */
function maxDifference(a: number[], b: number[]) {
  let max = 0
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue
    max = Math.max(max, Math.abs(a[i]! - b[i]!))
  }
  return max
}

function meanDifference(a: number[], b: number[]) {
  let sum = 0
  for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i]! - b[i]!)
  return sum / ((a.length / 4) * 3)
}

/** Counts orange pixels inside and outside a region, given in top-left-origin pixels. */
function countOrange(out: Rendered, isInside: (x: number, y: number) => boolean) {
  let inside = 0
  let outside = 0
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4
      const [r, g, b] = [out.pixels[i]!, out.pixels[i + 1]!, out.pixels[i + 2]!]
      if (r > 150 && r > g + 30 && g > b + 30) {
        if (isInside(x, y)) inside++
        else outside++
      }
    }
  }
  return { inside, outside }
}

test.beforeEach(async ({ page }) => {
  await page.goto('test-harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  expect(await page.evaluate(() => window.harness.supported())).toBe(true)
})

test('every preset renders at full size', async ({ page }) => {
  const ids = await page.evaluate(() => window.harness.presetIds())
  expect(ids.length).toBeGreaterThanOrEqual(18)
  for (const id of ids) {
    const out = await render(page, { preset: id, width: 160, height: 120 })
    expect(out.width, id).toBe(160)
    expect(out.height, id).toBe(120)
    const brightness = out.pixels.reduce((sum, v, i) => (i % 4 === 3 ? sum : sum + v), 0)
    expect(brightness, `${id} is black`).toBeGreaterThan(0)
  }
})

test('the Clean preset leaves pixels unchanged', async ({ page }) => {
  const out = await render(page, { preset: 'clean' })
  expect(maxDifference(out.pixels, out.original)).toBeLessThanOrEqual(2)
})

test('color presets change the image', async ({ page }) => {
  for (const preset of ['gold-200', 'muted-chrome', 'tungsten-800', 'infrared/ir400']) {
    const out = await render(page, { preset })
    expect(meanDifference(out.pixels, out.original), preset).toBeGreaterThan(2)
  }
})

test('monochrome presets have no color', async ({ page }) => {
  for (const preset of ['mono-400', 'grit-400', 'bw-snap', 'tlr-66/bw', 'pro-67/bw']) {
    const out = await render(page, { preset })
    let spread = 0
    for (let i = 0; i < out.pixels.length; i += 4) {
      const [r, g, b] = [out.pixels[i]!, out.pixels[i + 1]!, out.pixels[i + 2]!]
      spread = Math.max(spread, Math.max(r, g, b) - Math.min(r, g, b))
    }
    expect(spread, preset).toBeLessThanOrEqual(3)
  }
})

test('the same seed gives the same grain and a different seed different grain', async ({
  page,
}) => {
  const a = await render(page, { preset: 'fun-flash', seed: '42' })
  const b = await render(page, { preset: 'fun-flash', seed: '42' })
  const c = await render(page, { preset: 'fun-flash', seed: '43' })
  expect(maxDifference(a.pixels, b.pixels)).toBe(0)
  expect(meanDifference(a.pixels, c.pixels)).toBeGreaterThan(1)
})

test('the date stamp is drawn in the bottom-right corner', async ({ page }) => {
  const width = 400
  const height = 300
  const out = await render(page, {
    preset: { id: 'stamp', name: 'Stamp', category: 'digital', dateStamp: true },
    solid: '#404040',
    width,
    height,
  })
  const { inside, outside } = countOrange(out, (x, y) => x > width / 2 && y > height * 0.75)
  expect(inside).toBeGreaterThan(50)
  expect(outside).toBe(0)
})

/** Standard deviation of the green channel in a region, given in top-left-origin pixels. */
function spread(out: Rendered, x0: number, y0: number, x1: number, y1: number) {
  const values: number[] = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) values.push(out.pixels[(y * out.width + x) * 4 + 1]!)
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
}

test('grain can fade out in the highlights', async ({ page }) => {
  // Big enough grain that small test images get it at full strength.
  const grain = { intensity: 0.6, size: 5, response: [1, 1, 0] }
  const preset = { id: 'g', name: 'G', category: 'film135', grain }
  const mid = await render(page, { preset, solid: '#777777', width: 400, height: 300 })
  const bright = await render(page, { preset, solid: '#f4f4f4', width: 400, height: 300 })
  expect(spread(mid, 0, 0, 400, 300)).toBeGreaterThan(2)
  expect(spread(bright, 0, 0, 400, 300)).toBeLessThan(spread(mid, 0, 0, 400, 300) / 3)
})

test('color grain stays gray in black and white', async ({ page }) => {
  const out = await render(page, {
    preset: {
      id: 'm',
      name: 'M',
      category: 'film135',
      color: { monochrome: true },
      grain: { intensity: 0.8, chroma: 1, roughness: 1 },
    },
  })
  let maxSpread = 0
  for (let i = 0; i < out.pixels.length; i += 4) {
    const [r, g, b] = [out.pixels[i]!, out.pixels[i + 1]!, out.pixels[i + 2]!]
    maxSpread = Math.max(maxSpread, Math.max(r, g, b) - Math.min(r, g, b))
  }
  expect(maxSpread).toBeLessThanOrEqual(3)
})

test('lens distortion and fringing leave the center alone', async ({ page }) => {
  const lens = { distortion: 1, chromaticAberration: 1 }
  for (const distortion of [1, -1]) {
    const out = await render(page, {
      preset: { id: 'l', name: 'L', category: 'film135', lens: { ...lens, distortion } },
    })
    const center = ((out.height / 2) * out.width + out.width / 2) * 4
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(out.pixels[center + c]! - out.original[center + c]!)).toBeLessThanOrEqual(3)
    }
    expect(meanDifference(out.pixels, out.original), `${distortion}`).toBeGreaterThan(1)
  }
})

test('light leaks follow the seed', async ({ page }) => {
  const preset = {
    id: 'leak',
    name: 'Leak',
    category: 'disposable',
    lightLeak: { intensity: 0.8 },
    variation: { exposure: 0.3, temperature: 0.3 },
  }
  const a = await render(page, { preset, seed: '5', solid: '#202020' })
  const b = await render(page, { preset, seed: '5', solid: '#202020' })
  const c = await render(page, { preset, seed: '6', solid: '#202020' })
  expect(maxDifference(a.pixels, b.pixels)).toBe(0)
  expect(meanDifference(a.pixels, c.pixels)).toBeGreaterThan(1)
  // A leak on a dark image is warm: red clearly above blue somewhere.
  const warm = a.pixels.filter((r, i) => i % 4 === 0 && r > a.pixels[i + 2]! + 40).length
  expect(warm).toBeGreaterThan(100)
})

test('halation, bloom and edge blur render', async ({ page }) => {
  const out = await render(page, {
    preset: {
      id: 'glow',
      name: 'Glow',
      category: 'film135',
      halation: { intensity: 1 },
      bloom: { intensity: 1 },
      lens: { edgeBlur: 1 },
    },
  })
  expect(meanDifference(out.pixels, out.original)).toBeGreaterThan(1)
})

test("photos are encoded as JPEG at full size, in the look's shape", async ({ page }) => {
  const encode = (preset: string) =>
    page.evaluate((p) => window.harness.encode({ preset: p, width: 1200, height: 900 }), preset)
  expect(await encode('clean')).toEqual({ type: 'image/jpeg', width: 1200, height: 900 })
  // 35mm film is 2:3; the camera holds it upright.
  expect(await encode('gold-200')).toEqual({ type: 'image/jpeg', width: 600, height: 900 })
})
