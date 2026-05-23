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
      if (!blobs.length) return null
      const res = await fetch(blobs[0].url)
      return await res.json()
    } catch (e) {
      console.error('Blob get error:', e)
    }
  }
  return memStore
}

export async function setState(value) {
  const blob = await getBlob()
  if (blob) {
    try {
      await blob.put(BLOB_PATH, JSON.stringify(value), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      })
      return
    } catch (e) {
      console.error('Blob set error:', e)
    }
  }
  memStore = value
}
