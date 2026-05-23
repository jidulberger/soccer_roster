const BLOB_PATH = 'deathwalkers-roster-v1.json'

// In-memory fallback for local dev without BLOB_READ_WRITE_TOKEN configured.
let memStore = null

async function getBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null
  try {
    const { put, list } = await import('@vercel/blob')
    return { put, list }
  } catch {
    return null
  }
}

export async function getState() {
  const blob = await getBlob()
  if (blob) {
    try {
      const { blobs } = await blob.list({ prefix: BLOB_PATH })
      if (!blobs.length) return { _storage: 'blob', _empty: true }
      const res = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: 'no-store' })
      const data = await res.json()
      return { ...data, _storage: 'blob' }
    } catch (e) {
      console.error('Blob get error:', e)
      return { _storage: 'blob-error', _error: String(e?.message || e) }
    }
  }
  if (memStore) return { ...memStore, _storage: 'memory' }
  return { _storage: 'memory', _empty: true }
}

export async function setState(value) {
  const stamped = { ...value, _savedAt: Date.now() }
  const blob = await getBlob()
  if (blob) {
    try {
      await blob.put(BLOB_PATH, JSON.stringify(stamped), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
      })
      return { storage: 'blob', savedAt: stamped._savedAt }
    } catch (e) {
      console.error('Blob set error:', e)
      memStore = stamped
      return { storage: 'blob-failed', error: String(e?.message || e), savedAt: stamped._savedAt }
    }
  }
  memStore = stamped
  return { storage: 'memory', savedAt: stamped._savedAt }
}
