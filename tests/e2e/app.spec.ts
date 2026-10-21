import { expect, test, type Page } from '@playwright/test'
import { withExif } from '../fixtures/exif'

/** A 200×100 JPEG, red on the left and blue on the right, made by the browser. */
async function makeJPEG(page: Page): Promise<Uint8Array> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 100
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#d00'
    ctx.fillRect(0, 0, 100, 100)
    ctx.fillStyle = '#00d'
    ctx.fillRect(100, 0, 100, 100)
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1]!
  })
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

async function waitForCamera(page: Page) {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Take Photo' })).toBeEnabled()
}

test('the camera takes a photo and keeps it in the gallery', async ({ page }) => {
  await waitForCamera(page)
  await expect(page.getByRole('option', { name: /Gold 200/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  // Pick a disposable look, then shoot.
  await page.getByRole('tab', { name: 'Disposable' }).click()
  await page.getByRole('option', { name: /Fun Flash/ }).click()
  await page.getByRole('button', { name: 'Take Photo' }).click()

  await page.getByRole('button', { name: 'Last Photo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Last photo' })
  await expect(sheet.getByRole('img')).toBeVisible()
  await expect(sheet).toContainText('Fun Flash')

  // The saved photo is 3:4 portrait, like the viewfinder.
  const size = await sheet
    .getByRole('img')
    .evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }))
  expect(size.w / size.h).toBeCloseTo(3 / 4, 2)

  await sheet.getByRole('link', { name: 'All Photos' }).click()
  await expect(page.getByRole('link', { name: 'Fun Flash photo' })).toHaveCount(1)
  await page.getByRole('link', { name: 'Fun Flash photo' }).click()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  expect((await download).suggestedFilename()).toMatch(/^pocket-film-\d{8}-\d{6}\.jpg$/)

  // The look is remembered for next time.
  await page.goto('./')
  await expect(page.getByRole('option', { name: /Fun Flash/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('the editor applies a look to a library photo, upright, and saves it', async ({ page }) => {
  await waitForCamera(page)
  // EXIF orientation 6: the stored 200×100 image is shown rotated to 100×200.
  const jpeg = withExif(await makeJPEG(page), 6, '1999:12:31 23:59:00')
  await page.locator('input[type=file]').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg),
  })

  await expect(page).toHaveURL(/#\/edit/)
  const photo = page.getByRole('img', { name: /Photo with the .* look/ })
  await expect(photo).toBeVisible()
  const size = await photo.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }))
  expect(size).toEqual({ w: 100, h: 200 })

  // The editor starts with the camera's look; pick another one.
  await page.getByRole('tab', { name: 'Film' }).click()
  await page.getByRole('option', { name: /Mono 400/ }).click()
  await expect(page.getByRole('img', { name: 'Photo with the Mono 400 look' })).toBeVisible()

  // Holding the photo shows the original.
  await photo.dispatchEvent('pointerdown')
  await expect(page.getByText('Original', { exact: true })).toBeVisible()
  await photo.dispatchEvent('pointerup')
  await expect(page.getByText('Original', { exact: true })).toBeHidden()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Saved' })).toBeVisible()
  await page.getByRole('button', { name: 'OK' }).click()

  await page.goto('./#/gallery')
  await expect(page.getByRole('link', { name: 'Mono 400 photo' })).toHaveCount(1)
})

test('the editor explains when a file is not a photo', async ({ page }) => {
  await waitForCamera(page)
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not really a photo'),
  })
  await expect(page.getByRole('alertdialog')).toContainText("This photo couldn't be opened.")
})

test('the app works offline once loaded', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Take Photo' })).toBeVisible()
  await page.goto('./#/gallery')
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible()
  await context.setOffline(false)
})
