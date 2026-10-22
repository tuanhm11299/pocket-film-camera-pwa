export const thumbnailLongEdge = 360

/** A small JPEG of `source` for the gallery grid and the last-shot button. */
export async function makeThumbnail(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  const scale = Math.min(1, thumbnailLongEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.8),
  )
  if (!blob) throw new Error('The thumbnail could not be made.')
  return blob
}
