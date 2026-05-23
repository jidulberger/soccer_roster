// In-memory fallback for local dev without KV configured.
// In production on Vercel, serverless functions are ephemeral so this won't persist —
// always configure Vercel KV for production.
const memStore = {}

async function getKV() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null
  try {
    const { kv } = await import('@vercel/kv')
    return kv
  } catch {
    return null
  }
}

export async function getState(key) {
  const kv = await getKV()
  if (kv) {
    try { return await kv.get(key) } catch (e) { console.error('KV get error:', e) }
  }
  return memStore[key] ?? null
}

export async function setState(key, value) {
  const kv = await getKV()
  if (kv) {
    try { await kv.set(key, value); return } catch (e) { console.error('KV set error:', e) }
  }
  memStore[key] = value
}

export async function deleteState(key) {
  const kv = await getKV()
  if (kv) {
    try { await kv.del(key); return } catch (e) { console.error('KV del error:', e) }
  }
  delete memStore[key]
}
