import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type {} from '../../src/testing/harness'

// Renders every preset onto the test scene, so looks can be compared after tuning.
// CI uploads contact-sheet/ as the `preset-contact-sheet` artifact.
test('writes a contact sheet of every preset', async ({ page }) => {
  await page.goto('test-harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  const dataURL = await page.evaluate(() => window.harness.contactSheet())
  const png = Buffer.from(dataURL.replace(/^data:image\/png;base64,/, ''), 'base64')
  expect(png.length).toBeGreaterThan(10_000)
  await mkdir('contact-sheet', { recursive: true })
  await writeFile('contact-sheet/presets.png', png)
})
