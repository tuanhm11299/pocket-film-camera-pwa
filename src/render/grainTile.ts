import { SplitMix64 } from './splitmix64'

export const grainTileSize = 512

let tile: Uint8Array | undefined

/**
 * A tile of Gaussian-like noise around mid-gray, generated once. Each pixel has three
 * independent channels (RGB bytes), so color film can have color grain; black and white
 * grain uses the red channel only.
 */
export function grainTile(): Uint8Array {
  if (tile) return tile
  const rng = new SplitMix64(0x675241494en)
  const count = grainTileSize * grainTileSize * 3
  const bytes = new Uint8Array(count)
  // The sum of four uniform bytes is close to Gaussian; one 64-bit value gives two samples.
  const gaussian = (r: bigint) => {
    const v = Number(r & 0xffffffffn)
    return ((v & 0xff) + ((v >>> 8) & 0xff) + ((v >>> 16) & 0xff) + (v >>> 24)) >> 2
  }
  for (let i = 0; i < count; i += 2) {
    const r = rng.next()
    bytes[i] = gaussian(r)
    if (i + 1 < count) bytes[i + 1] = gaussian(r >> 32n)
  }
  tile = bytes
  return bytes
}
