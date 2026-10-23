// A page for tuning looks by eye: `npm run dev`, then open /tune.html. Pick a look, drop in
// a photo, edit the look's JSON and copy it back into cameras.json.
import camerasFile from '@/presets/cameras.json'
import { decodePreset, mergeJSON } from '@/presets/library'
import { FilmRenderer } from '@/render/FilmRenderer'
import { photoSize, pictureAspect, scaledToLongEdge } from '@/render/geometry'
import { drawTestScene } from './testScene'

type Json = Record<string, unknown>
const cameras = (camerasFile as { cameras: Json[] }).cameras

/** Every profile as the full look JSON its camera and profile merge into. */
const looks = cameras.flatMap((camera) => {
  const profiles = (camera.profiles as Json[] | undefined) ?? [{ id: 'default', name: camera.name }]
  return profiles.map((profile) => ({
    id: `${camera.id}/${profile.id}`,
    label: profiles.length > 1 ? `${camera.name} · ${profile.name}` : String(camera.name),
    json: mergeJSON(camera.look ?? {}, profile.look ?? {}) as Json,
    category: camera.category,
  }))
})

document.body.innerHTML = `
  <style>
    body { margin: 0; display: grid; grid-template-columns: 1fr 420px; height: 100vh;
      background: #1a1a1a; color: #eee; font: 13px system-ui, sans-serif; }
    main { display: grid; place-items: center; overflow: hidden; padding: 12px; }
    canvas { max-width: 100%; max-height: calc(100vh - 24px); }
    aside { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: #111; }
    textarea { flex: 1; background: #000; color: #cfc; font: 12px ui-monospace, monospace; }
    .row { display: flex; gap: 8px; align-items: center; }
    #error { color: #f88; min-height: 1.2em; }
  </style>
  <main><canvas id="canvas"></canvas></main>
  <aside>
    <select id="look"></select>
    <div class="row">
      <input id="file" type="file" accept="image/*" />
      <label><input id="original" type="checkbox" /> Original</label>
      <button id="seed">New seed</button>
      <button id="copy">Copy JSON</button>
    </div>
    <div id="error"></div>
    <textarea id="json" spellcheck="false"></textarea>
  </aside>`

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const select = $<HTMLSelectElement>('look')
const textarea = $<HTMLTextAreaElement>('json')
const error = $<HTMLDivElement>('error')
const original = $<HTMLInputElement>('original')
const renderer = new FilmRenderer($<HTMLCanvasElement>('canvas'), { preserveDrawingBuffer: true })

let source: { image: TexImageSource; width: number; height: number } = {
  image: drawTestScene(1200, 1600),
  width: 1200,
  height: 1600,
}
let seed = 7n

for (const look of looks) select.add(new Option(look.label, look.id))

function loadLook() {
  const look = looks.find((l) => l.id === select.value)!
  textarea.value = JSON.stringify(look.json, null, 2)
  draw()
}

function draw() {
  const look = looks.find((l) => l.id === select.value)!
  let json: Json
  try {
    json = original.checked ? {} : (JSON.parse(textarea.value) as Json)
    const preset = decodePreset({ ...json, id: look.id, name: look.label, category: look.category })
    const aspect = pictureAspect(preset.aspect, source.width, source.height, true)
    const full = photoSize(aspect, preset.frame, source.width, source.height)
    const size = scaledToLongEdge(full.width, full.height, 1600)
    renderer.render(preset, source, { seed, date: new Date() }, size.width, size.height)
    error.textContent = ''
  } catch (e) {
    error.textContent = (e as Error).message
  }
}

select.addEventListener('change', loadLook)
textarea.addEventListener('input', draw)
original.addEventListener('change', draw)
$('seed').addEventListener('click', () => {
  seed = BigInt(Math.floor(Math.random() * 2 ** 32))
  draw()
})
$('copy').addEventListener('click', () => void navigator.clipboard.writeText(textarea.value))
$<HTMLInputElement>('file').addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  source = { image: bitmap, width: bitmap.width, height: bitmap.height }
  draw()
})
loadLook()
