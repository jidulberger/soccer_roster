import { getState, setState } from '@/lib/storage'

// Force the route handler to be dynamic (not cached) on Vercel.
// Without this, Next.js 14 App Router may cache GET responses at build/edge.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
}

export async function GET() {
  const state = await getState()
  return Response.json(state || {}, { headers: NO_CACHE })
}

export async function POST(request) {
  const state = await request.json()
  const result = await setState(state)
  return Response.json({ ok: true, ...result }, { headers: NO_CACHE })
}
