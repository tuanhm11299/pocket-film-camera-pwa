# Pocket Film Camera (PWA)

A camera web app that makes photos look like they came from classic film stocks, early
digital cameras, medium format and instant cameras, or one-time-use (disposable) cameras.
It started as the web version of the iOS app
[pocket-film-camera](https://github.com/tuanhm11299/pocket-film-camera), and it installs
to your home screen and works offline.

Built with Vue 3, Vite and TypeScript. Looks are rendered with WebGL 2. There's no server,
no account and no tracking: photos stay in your browser until you share them.

See [docs/PLAN.md](docs/PLAN.md) for the plan and how the iOS app maps to the web.

## Using the app

- **Camera:** pick a camera under the viewfinder, and a profile and options for it, then
  press the shutter. The viewfinder shows the same shape, frame, grain, light leak and date
  stamp the photo will get. Tap the thumbnail to review
  or share the photo.
- **Library:** tap the photo button next to the shutter and pick a photo. Choose a look,
  touch and hold the photo to compare with the original, then **Save** or share it.
- **Photos:** everything you take or save is kept in the app's gallery (stored in your
  browser). A web app can't write to the Photos library directly, so use **Share** to keep
  a copy there. On iPhone, Share > **Save Image** puts it in Photos.

### Install it

- **iPhone (Safari):** Share > **Add to Home Screen**.
- **Android (Chrome):** menu > **Install app**.

The camera needs HTTPS, which GitHub Pages provides, or `localhost` during development.

## Requirements

- Node.js 22.18+ (or 24.12+)
- A browser with WebGL 2: Safari 15+, Chrome, Edge or Firefox

## Getting started

```sh
npm install
npm run dev
```

Then open the URL Vite prints. To try the camera on a phone during development, use
`npm run dev -- --host` and open the network URL. Phones only allow the camera over HTTPS,
so for real devices it's easier to use the GitHub Pages deployment.

### Checks

```sh
npm run lint           # ESLint
npm run format:check   # Prettier (npm run format fixes it)
npm run typecheck      # vue-tsc
npm test               # unit tests (Vitest): cameras, tone curves, color math, frames, EXIF dates
npm run test:e2e       # browser tests (Playwright, Chromium with a fake camera)
npm run build          # production build in dist/
```

`npm run test:e2e` builds the app with the renderer test harness (`vite build --mode test`),
serves it, and tests the renderer, the camera, editor and gallery flows, and offline use. It
also writes `contact-sheet/presets.png`, every look rendered onto a test scene. CI uploads
it as the `preset-contact-sheet` artifact, so you can compare looks after tuning.

The first time, install the browser with `npx playwright install chromium`.

## Deployment

`.github/workflows/deploy.yml` builds and publishes the app to GitHub Pages on every push to
`main`, at `https://<owner>.github.io/pocket-film-camera-pwa/`. Turn it on once under
**Settings > Pages > Build and deployment > Source: GitHub Actions**.

For another host, set the base path when building, for example `BASE_PATH=/ npm run build`.

## Cameras

Looks are organized like the cameras in Dazz Cam: pick a category (Digital, 135, 120,
Instant, Disposable), then a camera. A camera can have several color profiles, like films
loaded into it, and options such as a frame, a light leak, the date stamp or gate weave
(jitter). Each camera remembers what you picked. Cameras also have their own picture
shape: 35mm is 2:3, 6×6 and Instax Square are square, Pro 67 is 6:7 and Sprocket is a 9:4
panorama. In the editor, the shape turns to match a landscape photo.

| Category   | Cameras                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Digital    | Clean, Street D, CCD 2004, X Classic                                                            |
| 135        | SLR 35, Slide 35, Cine 35, Mono 35, Range 35, Pocket T2, Zoom 85, Sprocket, Expired U, Infrared |
| 120        | TLR 66, Holga, Pro 67                                                                           |
| Instant    | Mini Instant, Square Instant, Folding Instant                                                   |
| Disposable | Fun Flash, Snap 27, Simple 400, Party Flash, B&W Snap                                           |

### cameras.json

All cameras live in [`src/presets/cameras.json`](src/presets/cameras.json). A camera has an
`id`, `name`, optional `inspiredBy` subtitle, a `category` (`digital`, `film135`, `film120`,
`instant` or `disposable`), a base `look`, and optional `profiles`, `options` and
`frameColors`:

- Each profile has an `id`, `name`, optional `inspiredBy` and `notes` (what the look is
  aiming for), and a `look` that is merged over the camera's, key by key. A camera without
  profiles has one.
- `options` lists the toggles the camera offers and whether they start on: `frame`,
  `lightLeak`, `dateStamp`, `jitter`. A toggle needs its effect in the look.
- `aliases` maps old preset ids to `"camera/profile"`, so remembered looks keep working.

Every field of a look is optional and defaults to "no change":

- `color`, baked into a 3D LUT: `exposure` (stops), `contrast`, `saturation`,
  `shadowSaturation` / `highlightSaturation`, `temperature`, `tint`, `fade`,
  `highlightRolloff`, `clip` (digital highlight clipping), `matrix` (3×3 channel mix),
  `filmCurve` (`contrast`, `toe`, `shoulder`, `channelContrast` for color crossover),
  `hue` (per-band `hue` / `sat` / `lum` for `red`, `orange`, `yellow`, `green`, `aqua`,
  `blue`, `purple`, `magenta`), `monochrome` + `monoMix`, `shadowTint` / `highlightTint`
  (split toning) and `curves` (`master`, `red`, `green`, `blue` as `[[x, y], ...]` points)
- `grain`: `intensity`, `size`, `chroma` (color grain or sensor noise), `roughness`
  (clumps), `response` (strength in shadows, midtones, highlights)
- `lens`: `distortion` (+ barrel, − pincushion), `chromaticAberration`, `edgeBlur`, `blur`
- `halation` (`intensity`, `radius`, `color`, `threshold`), `bloom`, `softness`
- `flash`, `flashColor`, `vignette`
- `lightLeak`: `intensity`, `color`, `edgeColor`, `chance` (how many shots get one)
- `variation`: `exposure` and `temperature` that change from shot to shot
- `aspect` (`[width, height]`), `frame` (`style`: `instax-mini`, `instax-square`,
  `instant-white`, `film-35`, `film-120` or `slide-mount`; `color`; edge print `text`),
  `jitter`, `dateStamp`, `dateStampColor`

### Tuning looks

Run `npm run dev` and open `/tune.html`. Pick a look, drop in a photo, edit the look's JSON
and see the result live, then copy the JSON back into `cameras.json`. The contact sheet
from `npm run test:e2e` shows every profile on a test scene with a ColorChecker chart, skin
tones, foliage and a bright lamp.

## Differences from the iOS app

- The looks have grown past the iOS app's 19 presets: cameras with profiles, options,
  picture shapes and frames, and a richer color, grain and lens engine. Old preset ids
  still work.
- Photos are saved as sRGB JPEG. The iOS app saves HEIC in Display P3 and keeps EXIF and
  GPS data; the browser's canvas can't do either.
- Very large photos (over about 16 megapixels) are scaled down when saved, because iOS
  Safari limits how big a canvas can be.
- On iPhone, photos come from the camera's video stream (up to 2560×1920), since Safari has
  no API for full-resolution stills. Chrome on Android takes full-resolution stills and can
  use the flash.
- iPhone home-screen apps may ask for camera permission more often than Safari tabs do.
- On iPhone, Safari and the Home Screen app have separate storage, so photos taken in Safari
  don't appear after installing the app (and the reverse). Share photos to Photos to keep them.
  Safari may also clear a site's storage after about a week without visits; the installed app
  is exempt.
- HEIC photos open in Safari only.

## Project layout

```
src/presets/        cameras.json, camera and look types and the decoder
src/render/         color math, LUT, WebGL renderer and shaders, frames, JPEG export
src/camera/         camera stream and capture
src/photo/          loading library photos (orientation, EXIF date), thumbnails, sharing
src/gallery/        IndexedDB photo store
src/composables/    camera, alert and preference state
src/views/          camera, editor, gallery and photo screens
src/components/     camera picker, review sheet, alert, icons
src/testing/        renderer harness, look tuner and test scene
tests/unit/         Vitest
tests/e2e/          Playwright
scripts/            icon rendering
```

## License

[MIT](LICENSE)
