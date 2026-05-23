import { getState, setState, deleteState } from '@/lib/storage'

const KEY = 'deathwalkers-roster-v1'

export async function GET() {
  const state = await getState(KEY)
  return Response.json(state || {})
}

export async function POST(request) {
  const state = await request.json()
  await setState(KEY, state)
  return Response.json({ ok: true })
}

export async function DELETE() {
  await deleteState(KEY)
  return Response.json({ ok: true })
}
