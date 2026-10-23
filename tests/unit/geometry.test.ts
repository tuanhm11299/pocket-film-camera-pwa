import { describe, expect, it } from 'vitest'
import { frameStyles, type FrameSettings, type FrameStyle } from '@/presets/types'
import {
  aspectFillCrop,
  aspectFillWithin,
  fitRenderSize,
  framedAspect,
  framedSize,
  photoSize,
  pictureAspect,
  pictureRect,
  scaledToLongEdge,
} from '@/render/geometry'

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

describe('frames', () => {
  const frame = (style: FrameStyle): FrameSettings => ({ style, color: '#fff', text: '' })

  it('finds the picture again inside a framed photo', () => {
    for (const style of frameStyles) {
      for (const [w, h] of [
        [600, 900],
        [900, 600],
        [800, 800],
      ] as const) {
        const size = framedSize(w, h, frame(style))
        expect(size.width, style).toBeGreaterThan(w)
        expect(size.height, style).toBeGreaterThan(h)
        const rect = pictureRect(size.width, size.height, frame(style), w / h)
        expect(Math.abs(rect.width - w), `${style} ${w}×${h}`).toBeLessThanOrEqual(2)
        expect(Math.abs(rect.height - h), `${style} ${w}×${h}`).toBeLessThanOrEqual(2)
        expect(rect.x + rect.width).toBeLessThanOrEqual(size.width)
        expect(rect.y + rect.height).toBeLessThanOrEqual(size.height)
      }
    }
  })

  it('gives instant prints a wide bottom border', () => {
    const size = framedSize(460, 620, frame('instax-mini'))
    const rect = pictureRect(size.width, size.height, frame('instax-mini'), 460 / 620)
    const bottom = size.height - rect.y - rect.height
    expect(bottom).toBeGreaterThan(rect.y * 2)
    // Close to the real 54×86 mm print.
    expect(size.width / size.height).toBeCloseTo(54 / 86, 1)
  })

  it('puts film rebates along the long sides', () => {
    const upright = framedSize(240, 360, frame('film-35'))
    expect(upright.width - 240).toBeGreaterThan(upright.height - 360)
    const sideways = framedSize(360, 240, frame('film-35'))
    expect(sideways.height - 240).toBeGreaterThan(sideways.width - 360)
  })

  it('uses the whole output without a frame', () => {
    expect(pictureRect(300, 200, undefined)).toEqual({ x: 0, y: 0, width: 300, height: 200 })
    expect(framedAspect([3, 4], undefined)).toBeCloseTo(0.75, 6)
  })

  it('turns a shape to match the source only when asked', () => {
    expect(pictureAspect([2, 3], 3000, 2000, true)).toEqual([3, 2])
    expect(pictureAspect([2, 3], 3000, 2000, false)).toEqual([2, 3])
    expect(pictureAspect([1, 1], 3000, 2000, true)).toEqual([1, 1])
    expect(pictureAspect(undefined, 3000, 2000, true)).toEqual([3000, 2000])
  })

  it('crops a source to the shape and adds the frame', () => {
    expect(photoSize([2, 3], undefined, 3000, 4000)).toEqual({ width: 2667, height: 4000 })
    const framed = photoSize([1, 1], frame('slide-mount'), 3000, 4000)
    expect(framed.width).toBe(framed.height)
    expect(framed.width).toBeGreaterThan(3000)
  })

  it('crops within a crop', () => {
    const crop = aspectFillWithin({ x: 0.5, y: 0, width: 0.5, height: 1 }, 200, 100, 1, 1)
    expect(crop).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 })
    const square = aspectFillWithin({ x: 0, y: 0, width: 1, height: 1 }, 200, 100, 1, 1)
    expect(square.x).toBeCloseTo(0.25, 6)
    expect(square.width).toBeCloseTo(0.5, 6)
  })
})
