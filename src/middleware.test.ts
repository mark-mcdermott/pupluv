import { describe, expect, it } from 'vitest'
import { onRequest } from './middleware'

type Handler = (
  context: { url: URL; request: Request },
  next: () => Promise<Response>,
) => Promise<Response>

const handle = onRequest as unknown as Handler

function call(path: string, origin?: string, method = 'GET') {
  const url = new URL(`https://www.pupluv.online${path}`)
  const headers = origin ? { origin } : undefined
  const request = new Request(url, { method, headers })
  return handle({ url, request }, async () => new Response('ok'))
}

describe('the API origin allowlist', () => {
  // Every bundled client calls the deployed API cross-origin. A missing scheme
  // here is invisible from a browser and from curl, and fatal on the device.
  it.each([
    ['the phone', 'capacitor://localhost'],
    ['the older phone scheme', 'ionic://localhost'],
    ['the Mac app', 'tauri://localhost'],
    ['the Mac app on Windows-style hosts', 'http://tauri.localhost'],
    ['a dev server', 'http://localhost:4321'],
    ['a dev server by address', 'http://127.0.0.1:4321'],
  ])('answers %s', async (_who, origin) => {
    const response = await call('/api/events', origin)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
    expect(response.headers.get('vary')).toBe('origin')
  })

  it('says nothing to anyone else', async () => {
    const response = await call('/api/events', 'https://not-pupluv.example')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers a preflight without reaching the route', async () => {
    const response = await call('/api/events', 'tauri://localhost', 'OPTIONS')
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('leaves pages alone', async () => {
    const response = await call('/', 'tauri://localhost')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(await response.text()).toBe('ok')
  })
})
