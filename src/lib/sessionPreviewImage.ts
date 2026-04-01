const PREVIEW_IMAGE_KEY = 'preview_image'

function revokeStoredPreviewBlob(): void {
  if (typeof window === 'undefined') return
  try {
    const prev = sessionStorage.getItem(PREVIEW_IMAGE_KEY)
    if (prev?.startsWith('blob:')) {
      URL.revokeObjectURL(prev)
    }
  } catch {
    /* ignore */
  }
}

function trySetItem(value: string): boolean {
  try {
    sessionStorage.setItem(PREVIEW_IMAGE_KEY, value)
    return true
  } catch {
    return false
  }
}

/**
 * プレビュー用に sessionStorage に画像参照を保存する。
 * data URL は Blob URL に変換して短い文字列のみ保存し、Quota を避ける。
 */
export async function setSessionPreviewImage(url: string | null | undefined): Promise<void> {
  if (typeof window === 'undefined') return

  if (!url?.trim()) {
    revokeStoredPreviewBlob()
    try {
      sessionStorage.removeItem(PREVIEW_IMAGE_KEY)
    } catch {
      /* ignore */
    }
    return
  }

  revokeStoredPreviewBlob()

  if (url.startsWith('data:')) {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    if (!trySetItem(blobUrl)) {
      try {
        sessionStorage.removeItem(PREVIEW_IMAGE_KEY)
      } catch {
        /* ignore */
      }
      trySetItem(blobUrl)
    }
    return
  }

  if (!trySetItem(url)) {
    try {
      sessionStorage.removeItem(PREVIEW_IMAGE_KEY)
    } catch {
      /* ignore */
    }
    trySetItem(url)
  }
}
