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

interface GallerySchema extends DBSchema {
  photos: {
    key: string
    value: GalleryPhoto
    indexes: { createdAt: number }
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
  await (await db()).put('photos', entry)
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
  return photos.reverse()
}

export async function latestPhoto(): Promise<GalleryPhoto | undefined> {
  const cursor = await (
    await db()
  )
    .transaction('photos')
    .store.index('createdAt')
    .openCursor(null, 'prev')
  return cursor?.value
}

export async function getPhoto(id: string): Promise<GalleryPhoto | undefined> {
  return (await db()).get('photos', id)
}

export async function deletePhoto(id: string): Promise<void> {
  await (await db()).delete('photos', id)
}
