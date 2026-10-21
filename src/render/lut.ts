import type { ColorSettings } from '@/presets/types'
import { ColorTransform } from './colorTransform'

export const defaultLUTDimension = 33

/** RGBA Float32 values, red varying fastest, then green, then blue. */
export function cubeData(settings: ColorSettings, dimension = defaultLUTDimension): Float32Array {
  const transform = new ColorTransform(settings)
  const step = 1 / (dimension - 1)
  const values = new Float32Array(dimension * dimension * dimension * 4)
  let i = 0
  for (let b = 0; b < dimension; b++) {
    for (let g = 0; g < dimension; g++) {
      for (let r = 0; r < dimension; r++) {
        const out = transform.apply([r * step, g * step, b * step])
        values[i++] = out[0]
        values[i++] = out[1]
        values[i++] = out[2]
        values[i++] = 1
      }
    }
  }
  return values
}

const cache = new WeakMap<ColorSettings, Float32Array>()

/** `cubeData` at the default size, built once per settings object. */
export function cachedCubeData(settings: ColorSettings): Float32Array {
  let data = cache.get(settings)
  if (!data) {
    data = cubeData(settings)
    cache.set(settings, data)
  }
  return data
}
