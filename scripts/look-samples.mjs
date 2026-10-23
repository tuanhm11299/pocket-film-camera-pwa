// Renders a sample of every look and the camera screen for docs/LOOKS.md, and rewrites the
// doc's camera catalog from cameras.json. Run with `npm run docs:looks` after changing looks.
//
// It builds the app with the renderer harness (`vite build --mode test`), serves it, and
// drives it with Playwright, like the browser tests. The samples are the same on every run.
// The camera screen screenshots are not (live video, a random seed), so they are only taken
// when missing or with `npm run docs:looks -- --screenshots`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from '@playwright/test'
import { build, preview } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const docPath = `${root}docs/LOOKS.md`
const imageDir = `${root}docs/images`
const startMarker = '<!-- looks:start -->'
const endMarker = '<!-- looks:end -->'

const categories = [
  ['digital', 'Digital'],
  ['film135', '135 film'],
  ['film120', '120 film'],
  ['instant', 'Instant'],
  ['disposable', 'Disposable'],
]

const frameNames = {
  'instax-mini': 'Instax Mini print',
  'instax-square': 'Instax Square print',
  'instant-white': 'white instant print',
  'film-35': '35mm film strip with sprocket holes',
  'film-120': '120 film edge',
  'slide-mount': 'slide mount',
}

const optionNames = { frame: 'Frame', lightLeak: 'Light Leak', dateStamp: 'Date', jitter: 'Jitter' }

const signed = (v) => (v > 0 ? `+${v}` : `${v}`)
const triple = (v) => v.join(' / ')
const fileName = (id) => id.replace('/', '-')

/** The settings that make a look different from "no change", as short phrases. */
function describe(look) {
  const c = look.color
  const color = []
  if (c.exposure) color.push(`exposure ${signed(c.exposure)} stops`)
  if (c.filmCurve) {
    const f = c.filmCurve
    const channels = f.channelContrast.some((v) => v !== 1)
      ? `, per channel ${triple(f.channelContrast)}`
      : ''
    color.push(
      `film curve: contrast ${f.contrast}, toe ${f.toe}, shoulder ${f.shoulder}${channels}`,
    )
  } else if (c.contrast) {
    color.push(`contrast ${signed(c.contrast)}`)
  }
  if (c.saturation !== 1) color.push(`saturation ${c.saturation}`)
  if (c.shadowSaturation !== 1) color.push(`shadow saturation ${c.shadowSaturation}`)
  if (c.highlightSaturation !== 1) color.push(`highlight saturation ${c.highlightSaturation}`)
  if (c.temperature) color.push(`temperature ${signed(c.temperature)}`)
  if (c.tint) color.push(`tint ${signed(c.tint)}`)
  if (c.fade) color.push(`fade ${c.fade}`)
  if (c.highlightRolloff) color.push(`highlight rolloff ${c.highlightRolloff}`)
  if (c.clip) color.push(`highlight clipping ${c.clip}`)
  if (c.matrix) color.push('channel matrix')
  const bands = Object.entries(c.hue).map(([name, b]) => {
    const parts = []
    if (b.hue) parts.push(`hue ${signed(b.hue)}°`)
    if (b.sat) parts.push(`sat ${signed(b.sat)}`)
    if (b.lum) parts.push(`lum ${signed(b.lum)}`)
    return `${name} ${parts.join(' ')}`
  })
  if (bands.length) color.push(`hue bands: ${bands.join('; ')}`)
  if (c.monochrome) color.push(`black and white (mix ${triple(c.monoMix)})`)
  if (c.shadowTint.some((v) => v)) color.push(`shadow tint ${triple(c.shadowTint)}`)
  if (c.highlightTint.some((v) => v)) color.push(`highlight tint ${triple(c.highlightTint)}`)
  const curves = Object.keys(c.curves)
  if (curves.length) color.push(`curves: ${curves.join(', ')}`)

  const lines = []
  if (color.length) lines.push(['Color', color.join(', ')])
  if (look.grain) {
    const g = look.grain
    lines.push([
      'Grain',
      `intensity ${g.intensity}, size ${g.size}, color ${g.chroma}, clumping ${g.roughness}, ` +
        `strength in shadows / mids / highlights ${triple(g.response)}`,
    ])
  }
  const lens = []
  if (look.lens.distortion > 0) lens.push(`barrel distortion ${look.lens.distortion}`)
  if (look.lens.distortion < 0) lens.push(`pincushion distortion ${-look.lens.distortion}`)
  if (look.lens.chromaticAberration) lens.push(`color fringes ${look.lens.chromaticAberration}`)
  if (look.lens.edgeBlur) lens.push(`soft edges ${look.lens.edgeBlur}`)
  if (look.lens.blur) lens.push(`overall blur ${look.lens.blur}`)
  if (look.softness) lens.push(`glow ${look.softness}`)
  if (lens.length) lines.push(['Lens', lens.join(', ')])
  const light = []
  if (look.halation) {
    const h = look.halation
    light.push(`halation ${h.intensity} (radius ${h.radius}, from brightness ${h.threshold})`)
  }
  if (look.bloom) light.push(`bloom ${look.bloom.intensity}`)
  if (look.flash) light.push(`flash ${look.flash}`)
  if (look.vignette) light.push(`vignette ${look.vignette}`)
  if (look.lightLeak) {
    const l = look.lightLeak
    const chance = l.chance < 1 ? ` on ${Math.round(l.chance * 100)}% of shots` : ''
    light.push(`light leak ${l.intensity}${chance}`)
  }
  const v = look.variation
  if (v.exposure || v.temperature) {
    light.push(`varies ±${v.exposure} stops and ±${v.temperature} warmth per shot`)
  }
  if (light.length) lines.push(['Light', light.join(', ')])
  return lines
}

function cameraSummary(camera) {
  const look = camera.profiles[0].look
  const parts = []
  if (camera.inspiredBy) parts.push(`Inspired by ${camera.inspiredBy}`)
  parts.push(look.aspect ? `${look.aspect[0]}:${look.aspect[1]} picture` : 'phone shape (3:4)')
  if (look.frame) parts.push(`frame: ${frameNames[look.frame.style]}`)
  const options = Object.entries(camera.options).map(
    ([key, on]) => `${optionNames[key]} (${on ? 'on' : 'off'})`,
  )
  if (options.length) parts.push(`options: ${options.join(', ')}`)
  if (!('dateStamp' in camera.options) && look.dateStamp) parts.push('date stamp')
  if (camera.frameColors.length) {
    parts.push(`paper colors: ${camera.frameColors.map((c) => c.name).join(', ')}`)
  }
  const summary = parts.join(' · ')
  return summary[0].toUpperCase() + summary.slice(1)
}

function catalogMarkdown(cameras) {
  const out = []
  for (const [category, title] of categories) {
    out.push(`### ${title}`, '')
    for (const camera of cameras.filter((c) => c.category === category)) {
      out.push(`#### ${camera.name}`, '', cameraSummary(camera), '')
      for (const profile of camera.profiles) {
        const id = profile.look.id
        const name = camera.profiles.length > 1 ? `${camera.name} · ${profile.name}` : camera.name
        out.push(
          `<img src="images/looks/${fileName(id)}.jpg" alt="${name} sample" width="200" align="right">`,
          '',
        )
        if (camera.profiles.length > 1) out.push(`**${profile.name}** (\`${id}\`)`, '')
        else out.push(`\`${id}\``, '')
        if (profile.inspiredBy) out.push(`- **Inspired by:** ${profile.inspiredBy}`)
        if (profile.notes) out.push(`- **Aiming for:** ${profile.notes}`)
        for (const [label, text] of describe(profile.look)) out.push(`- **${label}:** ${text}`)
        if (!profile.notes && describe(profile.look).length === 0) out.push('- No changes.')
        out.push('', '<br clear="right">', '')
      }
    }
  }
  return out.join('\n')
}

/** RGBA pixels to a Y4M video for Chrome's fake camera: the test scene, held still. */
function sceneVideo(rgba, width, height) {
  const ySize = width * height
  const cSize = (width / 2) * (height / 2)
  const frame = Buffer.alloc(ySize + 2 * cSize)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]]
      frame[y * width + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      if (x % 2 === 0 && y % 2 === 0) {
        const c = (y / 2) * (width / 2) + x / 2
        frame[ySize + c] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b)
        frame[ySize + cSize + c] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b)
      }
    }
  }
  const chunks = [Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`)]
  for (let f = 0; f < 10; f++) chunks.push(Buffer.from('FRAME\n'), frame)
  return Buffer.concat(chunks)
}

const fromDataURL = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')

await build({ root, mode: 'test', logLevel: 'warn' })
const server = await preview({ root, mode: 'test', preview: { port: 4179, strictPort: true } })
const baseURL = server.resolvedUrls.local[0]
const gpuArgs = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

try {
  // Samples of every look, the contact sheet and the catalog.
  let browser = await chromium.launch({ args: gpuArgs })
  const page = await browser.newPage()
  await page.goto(`${baseURL}test-harness.html`)
  await page.waitForSelector('body[data-ready=true]', { state: 'attached' })
  mkdirSync(`${imageDir}/looks`, { recursive: true })
  const ids = await page.evaluate(() => window.harness.presetIds())
  for (const id of ids) {
    const url = await page.evaluate((i) => window.harness.sample(i, 360), id)
    writeFileSync(`${imageDir}/looks/${fileName(id)}.jpg`, fromDataURL(url))
  }
  const sheet = await page.evaluate(() => window.harness.contactSheet(240))
  await page.setContent(`<img src="${sheet}">`)
  const sheetJPEG = await page.evaluate(async () => {
    const img = document.querySelector('img')
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  })
  writeFileSync(`${imageDir}/contact-sheet.jpg`, fromDataURL(sheetJPEG))
  await page.goto(`${baseURL}test-harness.html`)
  await page.waitForSelector('body[data-ready=true]', { state: 'attached' })
  const cameras = await page.evaluate(() => window.harness.catalog())
  const scene = await page.evaluate(() =>
    window.harness.render({ preset: 'clean', width: 480, height: 640 }),
  )
  await browser.close()

  const doc = readFileSync(docPath, 'utf8')
  const start = doc.indexOf(startMarker)
  const end = doc.indexOf(endMarker)
  if (start < 0 || end < start) throw new Error(`${docPath} needs ${startMarker} and ${endMarker}`)
  writeFileSync(
    docPath,
    `${doc.slice(0, start + startMarker.length)}\n\n${catalogMarkdown(cameras)}\n${doc.slice(end)}`,
  )

  const screenshots = [
    'viewfinder-slr-35.jpg',
    'viewfinder-mini-instant.jpg',
    'viewfinder-holga.jpg',
  ]
  const retake =
    process.argv.includes('--screenshots') ||
    screenshots.some((file) => !existsSync(`${imageDir}/${file}`))
  if (!retake) {
    console.log(`Wrote ${ids.length} samples, the contact sheet and the catalog.`)
  }

  // The camera screen, with the test scene as the camera's picture.
  if (retake) {
    const video = `${root}.playwright/scene-camera.y4m`
    mkdirSync(`${root}.playwright`, { recursive: true })
    writeFileSync(video, sceneVideo(scene.original, 480, 640))
    browser = await chromium.launch({
      args: [
        ...gpuArgs,
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-video-capture=${video}`,
      ],
    })
    const context = await browser.newContext({ ...devices['iPhone 13'], permissions: ['camera'] })
    const app = await context.newPage()
    await app.goto(baseURL)
    await app.getByRole('button', { name: 'Take Photo' }).waitFor()
    const shoot = async (category, camera, file) => {
      await app.getByRole('tab', { name: category, exact: true }).click()
      await app.getByRole('option', { name: new RegExp(`^${camera}`) }).click()
      await app.waitForTimeout(3000)
      await app.screenshot({ path: `${imageDir}/${file}`, type: 'jpeg', quality: 80 })
    }
    await shoot('135', 'SLR 35', 'viewfinder-slr-35.jpg')
    await shoot('Instant', 'Mini Instant', 'viewfinder-mini-instant.jpg')
    await shoot('120', 'Holga', 'viewfinder-holga.jpg')
    await browser.close()
    console.log(`Wrote ${ids.length} samples, the contact sheet, the catalog and screenshots.`)
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve))
}
