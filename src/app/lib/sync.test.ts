import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventSchema, type PupEvent } from '@/lib/domain'
import { apiBase, sync } from './sync'
import { $events } from './state'
import { getOutbox, setOutbox, setToken } from './session'

describe('apiBase', () => {
  it('is empty when unset, so the web stays same-origin', () => {
    expect(apiBase(undefined)).toBe('')
    expect(apiBase('')).toBe('')
  })

  it('strips trailing slashes that would produce a redirecting //api path', () => {
    expect(apiBase('https://pupluv.vercel.app/')).toBe('https://pupluv.vercel.app')
    expect(apiBase('https://pupluv.vercel.app///')).toBe('https://pupluv.vercel.app')
  })

  it('leaves a clean origin alone', () => {
    expect(apiBase('https://pupluv.vercel.app')).toBe('https://pupluv.vercel.app')
    expect(apiBase('http://localhost:4321')).toBe('http://localhost:4321')
  })

  it('tolerates stray whitespace from a shell variable', () => {
    expect(apiBase('  https://pupluv.vercel.app/  ')).toBe('https://pupluv.vercel.app')
  })
})

const QUEUED: PupEvent = eventSchema.parse({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  dogId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  type: 'location',
  occurredAt: '2026-09-16T10:00:00.000Z',
  location: 'outside',
})

/** Answers the pull and the dog list; the push status is the thing under test. */
function server(pushStatus: number) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.includes('/api/events') && init?.method === 'POST') {
      return new Response(JSON.stringify({ error: 'nope' }), { status: pushStatus })
    }
    if (path.includes('/api/events')) {
      return Response.json({ events: [], cursor: null, more: false })
    }
    return Response.json({ dogs: [] })
  })
}

beforeEach(() => {
  localStorage.clear()
  setToken('a-token')
  $events.set([QUEUED])
  setOutbox([QUEUED.id])
})

afterEach(() => {
  vi.unstubAllGlobals()
  $events.set([])
  localStorage.clear()
})

describe('outbox drain', () => {
  it('clears the queue once the server accepts it', async () => {
    vi.stubGlobal('fetch', server(200))
    await sync()
    expect(getOutbox()).toEqual([])
  })

  it('drops a batch the server will never accept, so the queue cannot wedge', async () => {
    // A 400 means the event is permanently unsendable — an unknown dog, say.
    // Keeping it queued would block every entry logged after it, forever.
    vi.stubGlobal('fetch', server(400))
    await sync()
    expect(getOutbox()).toEqual([])
  })

  it('keeps a batch when the failure is transient', async () => {
    vi.stubGlobal('fetch', server(503))
    await sync()
    expect(getOutbox()).toEqual([QUEUED.id])
  })

  it('keeps a batch when the request never reaches the server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down')
    }))
    await sync()
    expect(getOutbox()).toEqual([QUEUED.id])
  })

  it('lets a later entry through once the poison batch is gone', async () => {
    vi.stubGlobal('fetch', server(400))
    await sync()

    const next = { ...QUEUED, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }
    $events.set([next])
    setOutbox([next.id])
    vi.stubGlobal('fetch', server(200))
    await sync()

    expect(getOutbox()).toEqual([])
  })
})
