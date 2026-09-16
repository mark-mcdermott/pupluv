import type { APIRoute } from 'astro'
import { issueToken, MIN_PIN_LENGTH, verifyPin } from '@/server/auth'
import { requireEnv } from '@/server/env'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null)
  const pin = typeof body?.pin === 'string' ? body.pin : ''

  if (pin.length < MIN_PIN_LENGTH) {
    return Response.json({ error: 'invalid pin' }, { status: 400 })
  }
  if (!(await verifyPin(pin, requireEnv('PIN_HASH')))) {
    return Response.json({ error: 'invalid pin' }, { status: 401 })
  }
  return Response.json({ token: await issueToken() })
}
