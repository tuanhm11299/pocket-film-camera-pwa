# Pocket Film Camera (PWA)

A camera web app that makes photos look like they came from classic film stocks, early
digital cameras, or one-time-use (disposable) cameras. It's the web version of the iOS app
[pocket-film-camera](https://github.com/tuanhm11299/pocket-film-camera), with the same
looks, and it installs to your home screen and works offline.

Built with Vue 3, Vite and TypeScript. Looks are rendered with WebGL 2. There's no server,
no account and no tracking: photos stay in your browser until you share them.

See [docs/PLAN.md](docs/PLAN.md) for the plan and how the iOS app maps to the web.

## Using the app

- **Camera:** pick a look under the viewfinder and press the shutter. The viewfinder shows
  the same grain, light leak and date stamp the photo will get. Tap the thumbnail to review
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
npm test               # unit tests (Vitest): presets, tone curves, color math, EXIF dates
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

## Presets

All looks live in [`src/presets/presets.json`](src/presets/presets.json), the same file as
the iOS app. Each preset has an `id`, `name`, optional `inspiredBy` subtitle and a
`category` (`film`, `digital` or `disposable`). Every other field is optional and defaults
to "no change":

- `color`: `exposure` (stops), `contrast`, `saturation`, `temperature`, `tint`, `fade`,
  `highlightRolloff`, `monochrome` + `monoMix`, `shadowTint` / `highlightTint` (split
  toning) and `curves` (`master`, `red`, `green`, `blue` as `[[x, y], ...]` points)
- effects: `grain`, `halation`, `softness`, `flash`, `vignette`, `lightLeak`, `dateStamp`

## Differences from the iOS app

- Photos are saved as sRGB JPEG. The iOS app saves HEIC in Display P3 and keeps EXIF and
  GPS data; the browser's canvas can't do either.
- Very large photos (over about 16 megapixels) are scaled down when saved, because iOS
  Safari limits how big a canvas can be.
- On iPhone, photos come from the camera's video stream (up to 2560×1920), since Safari has
  no API for full-resolution stills. Chrome on Android takes full-resolution stills and can
  use the flash.
- iPhone home-screen apps may ask for camera permission more often than Safari tabs do.
- HEIC photos open in Safari only.

## Project layout

```
src/presets/        presets.json, preset types and the decoder
src/render/         color math (ported from Swift), LUT, WebGL renderer and shaders, JPEG export
src/camera/         camera stream and capture
src/photo/          loading library photos (orientation, EXIF date), thumbnails, sharing
src/gallery/        IndexedDB photo store
src/composables/    camera, alert and preference state
src/views/          camera, editor, gallery and photo screens
src/components/     preset picker, review sheet, alert, icons
src/testing/        renderer harness and test scene for the browser tests
tests/unit/         Vitest
tests/e2e/          Playwright
scripts/            icon rendering
```

## License

[MIT](LICENSE)
