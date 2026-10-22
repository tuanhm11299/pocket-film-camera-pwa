# Pocket Film Camera PWA: Plan

This is the plan the app was built from, updated where the build differed. Milestones 1–7 are built; see
**Future work** at the end.

## Context

The goal is a web version of
`tuanhm11299/pocket-film-camera`, a native SwiftUI app
that makes photos look like they came from film stocks, 2000s digital cameras, or disposable cameras.
The PWA should work on iPhone and Android, install to the home screen, and work offline.

Decisions:

- **Vue 3 + Vite + TypeScript SPA**, made a PWA with `vite-plugin-pwa`. No SSR, no Nuxt.
- **GitHub Pages** hosting, deployed by GitHub Actions (HTTPS, which camera access needs).
- **Port the Swift app's features**, and add a **local gallery in IndexedDB**. Browsers can't write
  to the Photos library, so shots are kept in the app and saved or shared from there.

What we reuse from the Swift app. It is data-driven, so most of it ports directly:

- `PocketFilmCamera/Resources/Presets.json`: copy it as-is (19 presets: film, digital, disposable).
- `Models/FilmPreset.swift`: the preset schema and its defaults ("missing field = no change").
- `Models/ToneCurve.swift`: monotone cubic (Fritsch–Carlson) curves. Port line by line.
- `Rendering/ColorLUTBuilder.swift` (`ColorTransform`): per-pixel color math baked into a 33³ LUT. Port line by line.
- `Rendering/FilmRenderer.swift`: effect order (color → halation → softness → flash → vignette → light leak → grain → date stamp).
- `Rendering/Effects/*.swift`: constants for each effect (sizes relative to the short edge, thresholds, tints).
- `Rendering/SeededRandom.swift`: SplitMix64, so the same seed gives the same grain and light leak.
- UX: `CameraScreen`, `PresetPicker`, `EditorScreen`, `ShotReviewSheet`, `PhotoAlert`.
- Tests in `PocketFilmCameraTests/`: port them as Vitest and Playwright tests.

## Stack

- `vue@3`, `vue-router@4` with **hash history**, so GitHub Pages needs no 404 fallback.
- `vite`, `vite-plugin-pwa` (Workbox `generateSW`, precaches the whole app).
- `exifr` reads EXIF capture date and orientation. `idb` is a small IndexedDB wrapper.
- No UI framework: hand-written CSS with a dark theme, safe-area insets and `100dvh`.
- State: small composables (`useCamera`, `useEditor`, `useGallery`). No Pinia, since the state is small.
- Tooling: ESLint (flat config with `eslint-plugin-vue`), Prettier, `vue-tsc`, Vitest, Playwright
  (Chromium is preinstalled in this container).

## Project layout

```
index.html                      # iOS PWA meta tags, viewport-fit=cover
vite.config.ts                  # base '/pocket-film-camera-pwa/', VitePWA manifest + workbox
public/icons/                   # icon.svg and its PNG sizes (scripts/make-icons.mjs)
src/
  main.ts, App.vue, router.ts   # routes: / (camera), /edit, /gallery, /gallery/:id
  presets/                      # presets.json (copied from iOS), types.ts, library.ts (decoder)
  render/
    toneCurve.ts                # port of ToneCurve.swift
    colorTransform.ts, lut.ts   # port of ColorLUTBuilder.swift
    splitmix64.ts               # port of SeededRandom.swift (BigInt)
    renderOptions.ts            # seed + date, date stamp text
    geometry.ts                 # aspect-fill crop, export size limits
    grainTile.ts, dateStampImage.ts
    gl/shaders.ts               # GLSL ES 3.00 passes
    FilmRenderer.ts             # the WebGL2 pipeline
    encode.ts                   # full-resolution render -> JPEG + thumbnail
  camera/cameraService.ts       # getUserMedia, ImageCapture.takePhoto or frame grab
  photo/                        # sourcePhoto (orientation, EXIF date), thumbnail, share, pendingPhoto
  gallery/db.ts                 # IndexedDB store
  composables/                  # useCamera, useAlert, useObjectURL, usePreferences
  views/                        # CameraView, EditorView, GalleryView, PhotoView
  components/                   # PresetPicker, ShotReviewSheet, AppAlert, AppIcon
  testing/                      # renderer harness + synthetic test scene (built with --mode test)
tests/unit/                     # Vitest
tests/e2e/                      # Playwright: renderer pixels, contact sheet, app flows, offline
test-harness.html
.github/workflows/ci.yml        # lint, format, typecheck, unit, build, e2e, contact-sheet artifact
.github/workflows/deploy.yml    # build and deploy to GitHub Pages on push to main
```

## Rendering pipeline (WebGL2, same code for viewfinder, preview and export)

This replaces Core Image. Everything runs in fragment shaders over textures.

- **Color space handling:** Core Image blends in linear light, so we do too. All intermediate
  textures are `SRGB8_ALPHA8`. That format is renderable and filterable in core WebGL2, and the GPU
  converts sRGB↔linear on every read and write, so no extensions are needed. The final pass to the
  canvas encodes sRGB in the shader.
- **1. Crop and color (LUT):** the first pass crops and scales the source (aspect fill for the
  viewfinder) and applies the LUT. `lut.ts` builds the 33³ cube with the ported `ColorTransform`, the same math
  as Swift. It is uploaded as a `TEXTURE_3D` (`RGBA16F` from a Float32Array, `LINEAR` filtering).
  The shader converts linear to sRGB, samples at `(c*(N-1)+0.5)/N`, and converts back to linear.
  The pass is skipped when `color` is the identity, as in Swift.
- **2. Halation:** luma above 0.7, stretched to 0…1 → separable Gaussian blur at half
  resolution (radius `shortEdge*0.015*radius`) → tint `(1, 0.25, 0.08)*intensity` → screen blend.
- **3. Softness (CIBloom equivalent):** blur with radius `shortEdge*0.02`, then screen blend at
  `0.8*amount`. Tune visually against the iOS contact sheet.
- **4. Flash:** gain of `2^(0.5*amount)`, then multiply by a radial mask (white inside
  `shortEdge*0.1`, `1-0.6*amount` at `halfDiagonal`).
- **5. Vignette:** multiply by a radial mask (inner `shortEdge*0.3`, outer `halfDiagonal*1.05`,
  edge `1-0.75*amount`).
- **6. Light leak:** a seeded side (left or right) and height (20–80%), a radial gradient of
  radius `shortEdge*0.9` from `color*intensity` to black, screen blend.
- **7. Grain:** a 512² noise tile made once with SplitMix64 (sum of four 16-bit values, like the Swift
  code), `REPEAT` wrap. Scale is `max(1, shortEdge/1500*size)` and the offset comes from the seed.
  Spread around 0.5 is `k=min(intensity,1)*1.5`, then a soft-light blend.
- **8. Date stamp:** the text `'YY M D` (see `DateStamp.text`) is drawn on an OffscreenCanvas in
  bold monospace, orange `rgb(255,140,31)`, with a blurred glow copy behind it. Font size is
  `max(shortEdge*0.045, 8)` and the margin is `shortEdge*0.05`. It is uploaded as a texture and
  composited in the bottom-right corner.
- Ping-pong framebuffers come from a size-keyed pool. Blurs halve the resolution until sigma is at
  most 6 texels. Flash, vignette and light leak share one pass; grain, date stamp and the sRGB
  output share the last pass, which draws to the canvas.
- WebGL's origin is at the bottom left, like Core Image's. Keep that in mind so light-leak height
  and stamp placement match iOS.
- Output only has to look like the iOS app. It won't be bit-identical: Swift's `Int.random(in:using:)`
  differs from our helpers, and CIBloom has no exact formula.
- Handle `webglcontextlost` / `restored` by rebuilding textures, which matters on iOS when the app goes to the background.

## Screens

- **CameraView** (home), the same layout as `CameraScreen.swift`:
  - Top bar: flash (off → auto → on, shown only when the device reports `fillLightMode`) and flip camera.
  - 3:4 viewfinder: a `<canvas>` with WebGL. The hidden `<video>` is uploaded as a texture on every
    `requestVideoFrameCallback` (falling back to `requestAnimationFrame`), aspect-fill cropped and
    rendered at canvas size × min(devicePixelRatio, 2). It uses the **next shot's seed**, so its
    grain and leak match the photo.
  - `PresetPicker`: Film | Digital | Disposable tabs and a horizontal chip row with name and
    "Inspired by …". The selected chip scrolls to the center, and the last preset is remembered in `localStorage`.
  - Bottom bar: last-shot thumbnail (opens `ShotReviewSheet`), shutter, and library button (`<input type=file accept=image/*>` → EditorView).
  - **Capture:** use `ImageCapture.takePhoto({fillLightMode})` where available (Chrome on Android:
    full resolution and real flash). Otherwise grab the current frame at the track's highest
    resolution (iOS Safari). Then render at full size, encode JPEG, save to the gallery, update the
    thumbnail, and pick a new seed. The viewfinder blacks out for 120 ms when the shutter fires, and
    `navigator.vibrate` gives haptics where supported.
  - States: unavailable (no camera or no WebGL2: "You can still edit photos from your library"),
    denied (explains how to allow the camera in browser or site settings, plus a Retry button), and
    paused. Tracks stop on `visibilitychange` hidden and restart when visible, like the
    `scenePhase` handling.
- **EditorView** (`EditorScreen.swift`):
  - `sourcePhoto.ts` decodes with `createImageBitmap(file, {imageOrientation: 'from-image'})` to get
    the image upright. It makes a 1600px preview and reads the capture date with exifr for the date stamp.
  - Rendered preview plus `PresetPicker`. Press and hold (pointer events) shows the original.
  - **Save** renders at full resolution → JPEG → gallery. **Share** uses `navigator.share({files})`
    (on iOS, "Save Image" puts it in Photos), with a download as the fallback.
  - HEIC decodes only in Safari. Elsewhere, show a clear "this format can't be opened in this browser" alert.
- **GalleryView / PhotoView** (new): grid of thumbnails from IndexedDB, newest first. A photo opens
  in a viewer with Share, Download and Delete. Call `navigator.storage.persist()` on the first save.
- **AppAlert**: saved, failed and permission messages, like `PhotoAlert.swift`.

## Platform limits to handle

- **Canvas and texture size:** clamp the export so that width×height ≤ 16.7 MP and each side ≤
  `MAX_TEXTURE_SIZE`. This matters on iOS Safari, where a 48 MP photo is downscaled. Tiled
  full-resolution export is listed as future work.
- **Metadata:** canvas output drops EXIF. Output is sRGB JPEG, while iOS saves P3 HEIC. Copying
  EXIF into the output (e.g. with piexifjs, for JPEG sources) is future work.
- iOS home-screen PWAs ask for camera permission again more often than Safari tabs do. Document this in the README.

## PWA

- Manifest: name "Pocket Film", `display: standalone`, `orientation: portrait`, black
  theme/background, icons 192/512/maskable. `start_url` and `scope` use the Pages base path.
- Service worker precaches all assets (JS, CSS, presets, icons, noise is generated at runtime), so
  the app works fully offline. `registerType: 'prompt'` shows a small "Update available" toast.
- iOS: `apple-mobile-web-app-capable`, `black-translucent` status bar, apple-touch-icon, and safe-area padding.

## Milestones

1. ✅ **Scaffold:** Vite + Vue + TS, router, dark layout shell, ESLint, Prettier, Vitest, Playwright,
   `vite-plugin-pwa` and manifest, `ci.yml` and `deploy.yml` (Pages, base path), README.
   Add a root `LICENSE` with the standard MIT text, `Copyright (c) 2026 Huynh Minh Tuan` (the same
   as the Swift repo's LICENSE), and set `"license": "MIT"` in `package.json`.
2. ✅ **Presets and color math:** types, decoder with defaults and validation (curve points in 0…1,
   increasing x, at least 2 points), `toneCurve`, `colorTransform`, `lut`, `splitmix64`, and Vitest
   ports of `PresetLibraryTests`, `ToneCurveTests`, `ColorLUTBuilderTests` and `testDateStampText`.
3. ✅ **WebGL renderer and effects:** `FilmRenderer` and all 8 passes, `encode.ts`, test harness,
   Playwright renderer tests (ports of `FilmRendererTests`): output size, Clean preset unchanged,
   mono R≈G≈B, same seed gives the same pixels and a different seed different grain, date stamp
   lands bottom right. Also a **contact sheet** PNG of every preset, uploaded as a CI artifact like the iOS CI.
4. ✅ **Editor flow:** file pick → preview → presets → hold to compare → save to gallery and share or download.
5. ✅ **Camera flow:** `cameraService`, viewfinder, capture paths, flash and flip, blink, visibility
   handling, permission states, thumbnail and review sheet.
6. ✅ **Gallery:** IndexedDB store, grid, viewer, share, delete, persistent storage.
7. ✅ **PWA polish:** icons, offline check, update toast, iOS meta, safe areas, haptics. (Preset
   tuning against the iOS contact sheet is still to do; see Future work.)

## Verification

- `npm run lint && npm run typecheck && npm run test` (Vitest: preset decoding, curves, LUT math, SplitMix64).
- `npm run test:e2e` (Playwright on Chromium, WebGL2 through SwiftShader):
  - renderer pixel tests on the harness page
  - editor flow with a fixture JPEG that has an EXIF orientation and date
  - camera flow with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`
    (capture → thumbnail → gallery entry)
  - offline: load, wait for the service worker, `context.setOffline(true)`, reload, app still works
- `npm run build && npm run preview`, then a Lighthouse PWA/installability check.
- Manual test on real devices via the Pages URL: iPhone Safari (installed to the home screen) and
  Android Chrome. Check a smooth viewfinder (~30 fps), capture, flash (Android), front camera,
  sharing to Photos, and the gallery after a reload.

## Future work

- Tiled export, so photos over 16 MP keep their full resolution on iOS.
- Copy EXIF (capture date, GPS) into saved JPEGs from library photos, e.g. with piexifjs.
- Display P3 output where the browser supports it (`drawingBufferColorSpace`).
- Preset thumbnails on the chips, from one bundled sample photo.
- Tune the looks side by side with the iOS contact sheet.
