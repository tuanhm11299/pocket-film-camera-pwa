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
  for (const preset of ['gold-200', 'muted-chrome', 'tungsten-800']) {
    const out = await render(page, { preset })
    expect(meanDifference(out.pixels, out.original), preset).toBeGreaterThan(2)
  }
})

test('monochrome presets have no color', async ({ page }) => {
  for (const preset of ['mono-400', 'grit-400', 'bw-snap']) {
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

test('photos are encoded as JPEG at full size', async ({ page }) => {
  const out = await page.evaluate(() =>
    window.harness.encode({ preset: 'gold-200', width: 1200, height: 900 }),
  )
  expect(out).toEqual({ type: 'image/jpeg', width: 1200, height: 900 })
})
