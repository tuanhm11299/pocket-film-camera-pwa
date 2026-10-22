import { sharePhoto } from '@/photo/share'
import { useAlert } from './useAlert'

/**
 * Shares a photo. If the browser blocks the share sheet because the tap was too long ago
 * (Safari does after a slow render), asks for one more tap instead of failing.
 */
export function useSharePhoto() {
  const alerts = useAlert()
  return async function share(blob: Blob, fileName: string) {
    if ((await sharePhoto(blob, fileName)) !== 'blocked') return
    alerts.show({
      title: 'Photo Ready',
      message: 'Tap Share to save it to Photos or send it.',
      action: { label: 'Share', run: () => void sharePhoto(blob, fileName) },
    })
  }
}
