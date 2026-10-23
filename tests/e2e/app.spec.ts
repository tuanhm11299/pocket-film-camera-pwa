import { expect, test, type Locator, type Page } from '@playwright/test'
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

/** Waits until an <img> has actually decoded, not just been added to the page. */
async function expectImageLoaded(image: Locator) {
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)
}

/** Picks a camera, and maybe one of its profiles, on the camera or editor screen. */
async function pickCamera(page: Page, category: string, camera: string, profile?: string) {
  await page.getByRole('tab', { name: category, exact: true }).click()
  await page.getByRole('option', { name: new RegExp(`^${camera}`) }).click()
  if (profile) await page.getByRole('radio', { name: profile, exact: true }).click()
}

/** Picks a camera on the camera screen and takes a photo with it. */
async function takePhoto(page: Page, category: string, camera: string, profile?: string) {
  await pickCamera(page, category, camera, profile)
  await page.getByRole('button', { name: 'Take Photo' }).click()
  await expect(page.getByRole('button', { name: 'Last Photo' })).toBeVisible()
}

/** The natural size of the photo in the review sheet. */
async function reviewedPhotoSize(page: Page) {
  await page.getByRole('button', { name: 'Last Photo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Last photo' })
  await expectImageLoaded(sheet.getByRole('img'))
  const size = await sheet
    .getByRole('img')
    .evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }))
  await sheet.getByRole('button', { name: 'Done' }).click()
  return size
}

test('the camera takes a photo and shows it for review', async ({ page }) => {
  await waitForCamera(page)
  await expect(page.getByRole('option', { name: /^SLR 35/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('radio', { name: 'Gold 200' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await takePhoto(page, 'Disposable', 'Fun Flash')

  await page.getByRole('button', { name: 'Last Photo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Last photo' })
  await expect(sheet.getByRole('img')).toBeVisible()
  await expect(sheet).toContainText('Fun Flash')

  // A disposable shoots 35mm film: 2:3 upright, like the viewfinder.
  const size = await sheet
    .getByRole('img')
    .evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }))
  expect(size.w / size.h).toBeCloseTo(2 / 3, 2)
  const viewfinder = await page
    .locator('.viewfinder')
    .evaluate((el) => el.clientWidth / el.clientHeight)
  expect(viewfinder).toBeCloseTo(2 / 3, 1)
})

test('cameras have their own shape, frame and options', async ({ page }) => {
  // Many shots with heavy looks, on a software GPU.
  test.setTimeout(180_000)
  await waitForCamera(page)
  // Clean shoots 3:4, like the phone.
  await takePhoto(page, 'Digital', 'Clean')
  const clean = await reviewedPhotoSize(page)
  expect(clean.w / clean.h).toBeCloseTo(3 / 4, 2)

  // A square instant print has a frame with a wide bottom, so it is taller than wide.
  await takePhoto(page, 'Instant', 'Square Instant')
  const framed = await reviewedPhotoSize(page)
  expect(framed.h).toBeGreaterThan(framed.w * 1.1)

  // Without the frame, the picture is square.
  await page.getByRole('button', { name: 'Frame', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Frame', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await page.getByRole('button', { name: 'Take Photo' }).click()
  await expect
    .poll(async () => {
      const size = await reviewedPhotoSize(page)
      return Math.round((size.w / size.h) * 100) / 100
    })
    .toBe(1)

  // Each camera remembers its own choices.
  await pickCamera(page, '135', 'SLR 35', 'Vivid 100')
  await pickCamera(page, 'Instant', 'Square Instant')
  await expect(page.getByRole('button', { name: 'Frame', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await page.reload()
  await pickCamera(page, '135', 'SLR 35')
  await expect(page.getByRole('radio', { name: 'Vivid 100' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('camera photos are kept in the gallery and the look is remembered', async ({ page }) => {
  await waitForCamera(page)
  await takePhoto(page, '135', 'Mono 35', 'Grit 400')

  // After a reload the photo comes from storage, not memory, and must still show.
  await page.reload()
  await expectImageLoaded(page.getByRole('button', { name: 'Last Photo' }).locator('img'))

  const link = page.getByRole('link', { name: 'Mono 35 · Grit 400 photo' })
  await page.goto('./#/gallery')
  await expect(link).toHaveCount(1)
  await expectImageLoaded(link.locator('img'))
  await link.click()
  await expectImageLoaded(page.getByRole('img', { name: 'Photo with the Mono 35 · Grit 400 look' }))

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  expect((await download).suggestedFilename()).toMatch(/^pocket-film-\d{8}-\d{6}\.jpg$/)

  // The camera and profile are remembered for next time.
  await page.goto('./')
  await expect(page.getByRole('option', { name: /^Mono 35/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('radio', { name: 'Grit 400' })).toHaveAttribute(
    'aria-checked',
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
  // The editor starts with the camera's look, cropped to 35mm film's 2:3.
  await expect(
    page.getByRole('img', { name: 'Photo with the SLR 35 · Gold 200 look' }),
  ).toBeVisible()
  const size = await photo.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }))
  expect(size).toEqual({ w: 100, h: 150 })

  // Clean keeps the photo's own shape.
  await pickCamera(page, 'Digital', 'Clean')
  await expect
    .poll(() => photo.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height })))
    .toEqual({ w: 100, h: 200 })

  await pickCamera(page, '135', 'Mono 35')
  await expect(
    page.getByRole('img', { name: 'Photo with the Mono 35 · Mono 400 look' }),
  ).toBeVisible()

  // Holding the photo shows the original.
  await photo.dispatchEvent('pointerdown')
  await expect(page.getByText('Original', { exact: true })).toBeVisible()
  await photo.dispatchEvent('pointerup')
  await expect(page.getByText('Original', { exact: true })).toBeHidden()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Saved' })).toBeVisible()
  await page.getByRole('button', { name: 'OK' }).click()

  await page.goto('./#/gallery')
  await expect(page.getByRole('link', { name: 'Mono 35 · Mono 400 photo' })).toHaveCount(1)
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

test('photos saved by the first version still show in the gallery', async ({ page }) => {
  await waitForCamera(page)
  // Version 1 stored Blobs directly; write one the same way.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 30
    canvas.height = 40
    canvas.getContext('2d')!.fillRect(0, 0, 30, 40)
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg'),
    )
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('pocket-film', 1)
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('photos', 'readwrite')
        tx.objectStore('photos').put({
          id: 'legacy',
          blob,
          thumbnail: blob,
          presetId: 'clean',
          presetName: 'Clean',
          width: 30,
          height: 40,
          createdAt: Date.now(),
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
    })
  })

  await page.goto('./#/gallery')
  await expectImageLoaded(page.getByRole('link', { name: 'Clean photo' }).locator('img'))
})

test('a share the browser blocks asks for one more tap', async ({ page }) => {
  // Like Safari after a slow render: the first share is refused, a share from a new tap works.
  await page.addInitScript(() => {
    const shared: number[] = []
    Object.assign(window, { shared })
    navigator.canShare = () => true
    navigator.share = async (data?: ShareData) => {
      shared.push(data?.files?.length ?? 0)
      if (shared.length === 1) throw new DOMException('Not allowed', 'NotAllowedError')
    }
  })
  await waitForCamera(page)
  await page.locator('input[type=file]').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(await makeJPEG(page)),
  })
  await expect(page.getByRole('img', { name: /Photo with the .* look/ })).toBeVisible()

  await page.getByRole('button', { name: 'Share' }).click()
  const prompt = page.getByRole('alertdialog', { name: 'Photo Ready' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: 'Share' }).click()
  await expect(prompt).toBeHidden()
  expect(await page.evaluate(() => (window as unknown as { shared: number[] }).shared)).toEqual([
    1, 1,
  ])
})
