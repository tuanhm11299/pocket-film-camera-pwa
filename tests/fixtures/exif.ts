/**
 * Inserts a minimal EXIF block (orientation and capture date) into a JPEG,
 * for testing that imported photos come out upright with the right date.
 */
export function withExif(
  jpeg: Uint8Array,
  orientation: number,
  dateTimeOriginal: string,
): Uint8Array {
  // Little-endian TIFF: IFD0 has Orientation and a pointer to the Exif IFD, which has DateTimeOriginal.
  const date = new TextEncoder().encode(`${dateTimeOriginal}\0`) // "YYYY:MM:DD HH:MM:SS\0", 20 bytes
  const ifd0Offset = 8
  const ifd0Size = 2 + 2 * 12 + 4
  const exifIfdOffset = ifd0Offset + ifd0Size
  const exifIfdSize = 2 + 12 + 4
  const dateOffset = exifIfdOffset + exifIfdSize
  const tiff = new Uint8Array(dateOffset + date.length)
  const view = new DataView(tiff.buffer)
  tiff.set([0x49, 0x49, 0x2a, 0x00])
  view.setUint32(4, ifd0Offset, true)

  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    view.setUint16(at, tag, true)
    view.setUint16(at + 2, type, true)
    view.setUint32(at + 4, count, true)
    if (type === 3) view.setUint16(at + 8, value, true)
    else view.setUint32(at + 8, value, true)
  }
  view.setUint16(ifd0Offset, 2, true)
  entry(ifd0Offset + 2, 0x0112, 3, 1, orientation) // Orientation, SHORT
  entry(ifd0Offset + 14, 0x8769, 4, 1, exifIfdOffset) // ExifIFDPointer, LONG
  view.setUint32(ifd0Offset + 26, 0, true)
  view.setUint16(exifIfdOffset, 1, true)
  entry(exifIfdOffset + 2, 0x9003, 2, date.length, dateOffset) // DateTimeOriginal, ASCII
  view.setUint32(exifIfdOffset + 14, 0, true)
  tiff.set(date, dateOffset)

  const header = new TextEncoder().encode('Exif\0\0')
  const length = 2 + header.length + tiff.length
  const app1 = new Uint8Array(2 + length)
  app1.set([0xff, 0xe1, length >> 8, length & 0xff])
  app1.set(header, 4)
  app1.set(tiff, 4 + header.length)

  // Right after the SOI marker.
  const out = new Uint8Array(jpeg.length + app1.length)
  out.set(jpeg.subarray(0, 2))
  out.set(app1, 2)
  out.set(jpeg.subarray(2), 2 + app1.length)
  return out
}

/** The smallest byte sequence exifr reads as a JPEG: SOI, then EOI. */
export const emptyJPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
