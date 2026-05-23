import { getState, setState } from '@/lib/storage'

const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const state = await getState()
  return Response.json(state || {}, { headers: NO_CACHE })
}

export async function POST(request) {
  const state = await request.json()
  const result = await setState(state)
  return Response.json({ ok: true, ...result }, { headers: NO_CACHE })
}
