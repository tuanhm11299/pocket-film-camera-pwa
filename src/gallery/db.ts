import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/** A finished photo kept in the app, since a web app can't write to the Photos library. */
export interface GalleryPhoto {
  id: string
  blob: Blob
  thumbnail: Blob
  presetId: string
  presetName: string
  width: number
  height: number
  /** Milliseconds since 1970. */
  createdAt: number
}

/**
 * How a photo is stored. iOS Safari can't reliably use a Blob read back from IndexedDB after a
 * reload (images and shares fail with "WebKitBlobResource error 1"), so the bytes are stored
 * and the Blobs rebuilt on read. Photos saved by the first version have `blob` and `thumbnail`.
 */
type StoredPhoto = Omit<GalleryPhoto, 'blob' | 'thumbnail'> &
  (
    | { bytes: ArrayBuffer; type: string; thumbnailBytes: ArrayBuffer; thumbnailType: string }
    | { blob: Blob; thumbnail: Blob }
  )

interface GallerySchema extends DBSchema {
  photos: {
    key: string
    value: StoredPhoto
    indexes: { createdAt: number }
  }
}

function fromStored(stored: StoredPhoto): GalleryPhoto {
  if ('blob' in stored) return stored
  const { bytes, type, thumbnailBytes, thumbnailType, ...photo } = stored
  return {
    ...photo,
    blob: new Blob([bytes], { type }),
    thumbnail: new Blob([thumbnailBytes], { type: thumbnailType }),
  }
}

let database: Promise<IDBPDatabase<GallerySchema>> | undefined

function db() {
  database ??= openDB<GallerySchema>('pocket-film', 1, {
    upgrade(db) {
      const store = db.createObjectStore('photos', { keyPath: 'id' })
      store.createIndex('createdAt', 'createdAt')
    },
  })
  return database
}

let askedToPersist = false

export async function addPhoto(
  photo: Omit<GalleryPhoto, 'id' | 'createdAt'>,
): Promise<GalleryPhoto> {
  const entry: GalleryPhoto = { ...photo, id: crypto.randomUUID(), createdAt: Date.now() }
  // Read the bytes before opening the transaction, which would close while waiting.
  const [bytes, thumbnailBytes] = await Promise.all([
    photo.blob.arrayBuffer(),
    photo.thumbnail.arrayBuffer(),
  ])
  const { blob, thumbnail, ...rest } = entry
  await (
    await db()
  ).put('photos', {
    ...rest,
    bytes,
    type: blob.type || 'image/jpeg',
    thumbnailBytes,
    thumbnailType: thumbnail.type || 'image/jpeg',
  })
  if (!askedToPersist) {
    askedToPersist = true
    // Ask the browser not to evict the photos when storage runs low.
    void navigator.storage?.persist?.().catch(() => false)
  }
  return entry
}

/** Newest first. */
export async function listPhotos(): Promise<GalleryPhoto[]> {
  const photos = await (await db()).getAllFromIndex('photos', 'createdAt')
  return photos.reverse().map(fromStored)
}

export async function latestPhoto(): Promise<GalleryPhoto | undefined> {
  const cursor = await (
    await db()
  )
    .transaction('photos')
    .store.index('createdAt')
    .openCursor(null, 'prev')
  return cursor ? fromStored(cursor.value) : undefined
}

export async function getPhoto(id: string): Promise<GalleryPhoto | undefined> {
  const stored = await (await db()).get('photos', id)
  return stored && fromStored(stored)
}

export async function deletePhoto(id: string): Promise<void> {
  await (await db()).delete('photos', id)
}
