import { describe, expect, it } from 'vitest'
import { parseExifDate, readCaptureDate } from '@/photo/sourcePhoto'
import { emptyJPEG, withExif } from '../fixtures/exif'

describe('readCaptureDate', () => {
  it('reads the capture date from EXIF', async () => {
    const date = await readCaptureDate(withExif(emptyJPEG, 6, '2004:07:15 18:30:00'))
    expect(date).toEqual(new Date(2004, 6, 15, 18, 30, 0))
  })

  it('returns nothing for data without EXIF', async () => {
    expect(await readCaptureDate(emptyJPEG)).toBeUndefined()
    expect(await readCaptureDate(new TextEncoder().encode('not an image'))).toBeUndefined()
  })
})

describe('parseExifDate', () => {
  it('uses the offset when there is one', () => {
    expect(parseExifDate('2004:07:15 18:30:00', '+02:00')).toEqual(new Date('2004-07-15T16:30:00Z'))
    expect(parseExifDate('2004:07:15 18:30:00', '-05:30')).toEqual(new Date('2004-07-16T00:00:00Z'))
  })

  it('uses local time without an offset', () => {
    expect(parseExifDate('2004:07:15 18:30:00')).toEqual(new Date(2004, 6, 15, 18, 30, 0))
  })

  it('rejects malformed dates', () => {
    expect(parseExifDate('yesterday')).toBeUndefined()
  })
})
