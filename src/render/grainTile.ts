import { SplitMix64 } from './splitmix64'

export const grainTileSize = 512

let tile: Uint8Array | undefined

/** A tile of Gaussian-like noise around mid-gray, one byte per pixel, generated once. */
export function grainTile(): Uint8Array {
  if (tile) return tile
  const rng = new SplitMix64(0x675241494en)
  const count = grainTileSize * grainTileSize
  const bytes = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    // The sum of four 16-bit uniform values is close to Gaussian.
    const r = rng.next()
    const sum =
      Number(r & 0xffffn) +
      Number((r >> 16n) & 0xffffn) +
      Number((r >> 32n) & 0xffffn) +
      Number(r >> 48n)
    bytes[i] = Math.floor(sum / 1028)
  }
  tile = bytes
  return bytes
}
