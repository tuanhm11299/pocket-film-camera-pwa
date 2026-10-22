import { describe, expect, it } from 'vitest'
import { aspectFillCrop, fitRenderSize, scaledToLongEdge } from '@/render/geometry'

describe('aspectFillCrop', () => {
  it('covers and centers a landscape frame in a portrait view', () => {
    const crop = aspectFillCrop(1920, 1080, 300, 400)
    // The view is 3:4, so the visible width is 1080 * 3/4 = 810 source pixels.
    expect(crop.width * 1920).toBeCloseTo(810, 6)
    expect(crop.height).toBeCloseTo(1, 6)
    expect(crop.x).toBeCloseTo((1 - crop.width) / 2, 6)
    expect(crop.y).toBeCloseTo(0, 6)
  })

  it('uses the whole frame when the shapes match', () => {
    expect(aspectFillCrop(1200, 1600, 300, 400)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
})

describe('fitRenderSize', () => {
  it('keeps sizes that fit', () => {
    expect(fitRenderSize(4032, 3024, 16384)).toEqual({ width: 4032, height: 3024 })
  })

  it('scales a 48 MP photo below the canvas limit', () => {
    const size = fitRenderSize(8064, 6048, 16384)
    expect(size.width * size.height).toBeLessThanOrEqual(16_777_216)
    expect(size.width / size.height).toBeCloseTo(8064 / 6048, 2)
  })

  it('respects the maximum texture size', () => {
    expect(fitRenderSize(8000, 2000, 4096)).toEqual({ width: 4096, height: 1024 })
  })
})

describe('scaledToLongEdge', () => {
  it('scales the preview down to the long edge', () => {
    expect(scaledToLongEdge(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('does not scale a small photo up', () => {
    expect(scaledToLongEdge(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})
