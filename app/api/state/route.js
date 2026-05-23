import { getState, setState } from '@/lib/storage'

export async function GET() {
  const state = await getState()
  return Response.json(state || {})
}

export async function POST(request) {
  const state = await request.json()
  await setState(state)
  return Response.json({ ok: true })
}
