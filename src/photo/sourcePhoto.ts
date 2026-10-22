import exifr from 'exifr/dist/mini.esm.mjs'
import { scaledToLongEdge } from '@/render/geometry'

/** A photo imported for editing: upright, plus a smaller copy for fast previews. */
export interface SourcePhoto {
  /** Full resolution, upright. */
  full: ImageBitmap
  /** `full` scaled down so its long edge is at most `previewLongEdge`. */
  preview: ImageBitmap
  width: number
  height: number
  /** When the photo was taken, from its EXIF data. */
  captureDate?: Date
}

export class UnreadablePhotoError extends Error {}

export const previewLongEdge = 1600

export async function loadSourcePhoto(file: Blob): Promise<SourcePhoto> {
  let full: ImageBitmap
  try {
    // 'from-image' applies the EXIF orientation, so the photo is upright.
    full = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new UnreadablePhotoError(
      file.type === 'image/heic' || file.type === 'image/heif'
        ? "This browser can't open HEIC photos. Try a JPEG, or open the app in Safari."
        : "This photo couldn't be opened.",
    )
  }
  if (full.width === 0 || full.height === 0)
    throw new UnreadablePhotoError("This photo couldn't be opened.")

  const size = scaledToLongEdge(full.width, full.height, previewLongEdge)
  const preview =
    size.width === full.width
      ? full
      : await createImageBitmap(full, {
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: 'high',
        })

  return {
    full,
    preview,
    width: full.width,
    height: full.height,
    captureDate: await readCaptureDate(file),
  }
}

// EXIF tag numbers; the mini build of exifr doesn't translate them to names.
const dateTimeOriginalTag = 0x9003
const offsetTimeOriginalTag = 0x9011

/** EXIF `DateTimeOriginal`, using `OffsetTimeOriginal` when present and local time otherwise. */
export async function readCaptureDate(
  file: Blob | ArrayBuffer | Uint8Array,
): Promise<Date | undefined> {
  try {
    const tags = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: false,
      ifd1: false,
      interop: false,
    })
    const dateTime = tags?.[dateTimeOriginalTag]
    if (typeof dateTime !== 'string') return undefined
    const offset = tags?.[offsetTimeOriginalTag]
    return parseExifDate(dateTime, typeof offset === 'string' ? offset : undefined)
  } catch {
    return undefined
  }
}

/** Parses "YYYY:MM:DD HH:MM:SS", with an optional "+HH:MM" offset. */
export function parseExifDate(dateTime: string, offset?: string): Date | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dateTime.trim())
  if (!m) return undefined
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const o = offset ? /^([+-])(\d{2}):(\d{2})$/.exec(offset.trim()) : null
  let date: Date
  if (o) {
    const sign = o[1] === '-' ? -1 : 1
    const offsetMinutes = sign * (Number(o[2]) * 60 + Number(o[3]))
    date = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000)
  } else {
    date = new Date(year, month - 1, day, hour, minute, second)
  }
  return Number.isNaN(date.getTime()) ? undefined : date
}
