export type ShareResult = 'shared' | 'downloaded' | 'cancelled'

export function photoFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `pocket-film-${stamp}.jpg`
}

/**
 * Opens the share sheet with the photo (on iPhone, "Save Image" puts it in Photos),
 * or downloads it where sharing files isn't supported.
 */
export async function sharePhoto(blob: Blob, fileName: string): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled'
      // Fall through to a download, e.g. when sharing isn't allowed right now.
    }
  }
  downloadPhoto(blob, fileName)
  return 'downloaded'
}

export function downloadPhoto(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
