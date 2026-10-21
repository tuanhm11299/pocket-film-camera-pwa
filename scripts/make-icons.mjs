// Renders public/icons/icon.svg to the PNG sizes the web app manifest and iOS need.
// Run with: node scripts/make-icons.mjs
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8')
const sizes = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // Maskable icons are cropped to a circle or squircle, so the art is drawn smaller.
  ['icon-maskable-512.png', 512, 0.8],
  ['apple-touch-icon.png', 180, 1],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, scale] of sizes) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`
    <body style="margin:0;background:#111;display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${size * scale}px;height:${size * scale}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </body>`)
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname })
}
await browser.close()
