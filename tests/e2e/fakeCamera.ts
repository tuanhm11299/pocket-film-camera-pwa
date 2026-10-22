import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Writes a short Y4M video for Chrome's fake camera (`--use-file-for-fake-video-capture`).
 *
 * Without it, the fake camera honors the app's 2560×1920 request. CI renders WebGL in software,
 * where uploading frames that big makes each viewfinder frame take about a third of a second
 * and the page crawls. A 640×480 file keeps the camera tests fast; the app code is the same.
 */
export function writeFakeCamera(path: string, width = 640, height = 480, frames = 30) {
  const header = `YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`
  const ySize = width * height
  const cSize = (width / 2) * (height / 2)
  const frameHeader = Buffer.from('FRAME\n')
  const chunks: Buffer[] = [Buffer.from(header)]
  for (let f = 0; f < frames; f++) {
    const frame = Buffer.alloc(ySize + 2 * cSize)
    // Luma: a diagonal gradient with a bright square moving across it.
    const square = Math.round((f / frames) * (width - height / 4))
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inSquare =
          x >= square && x < square + height / 4 && y >= height / 3 && y < height / 3 + height / 4
        frame[y * width + x] = inSquare ? 235 : 40 + Math.round((150 * (x + y)) / (width + height))
      }
    }
    // Chroma: warm at the top, cool at the bottom, so color looks have something to change.
    for (let y = 0; y < height / 2; y++) {
      const t = y / (height / 2)
      for (let x = 0; x < width / 2; x++) {
        frame[ySize + y * (width / 2) + x] = Math.round(100 + 60 * t) // U (blue difference)
        frame[ySize + cSize + y * (width / 2) + x] = Math.round(160 - 60 * t) // V (red difference)
      }
    }
    chunks.push(frameHeader, frame)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.concat(chunks))
}
