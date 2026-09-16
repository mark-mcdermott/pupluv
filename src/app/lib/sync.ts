import { eventSchema, type Dog, type DraftEvent, type PupEvent } from '@/lib/domain'
import { SignInFailed } from './errors'
import { $authed, $dogs, $events, $ready, $sync } from './state'
import { loadEvents, saveEvents } from './store'
import {
  clearSession,
  getCursor,
  getOutbox,
  getToken,
  setCursor,
  setOutbox,
  setToken,
} from './session'

/**
 * A trailing slash on the configured origin would produce `//api/auth`, which
 * Vercel answers with a 308. A cross-origin POST does not survive that redirect
 * — it carries no CORS headers — so the app would report itself unreachable
 * because of one character in an env var. Normalise instead of trusting it.
 */
export function apiBase(configured: string | undefined): string {
  return (configured ?? '').trim().replace(/\/+$/, '')
}

// Same-origin on the web. The bundled iOS build is served from
// capacitor://localhost, so it is given the deployed origin at build time.
const API_BASE = apiBase(import.meta.env.PUBLIC_API_URL)

class AuthError extends Error {}

class ApiError extends Error {
  constructor(readonly status: number) {
    super(`request failed: ${status}`)
    this.name = 'ApiError'
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (response.status === 401) {
    clearSession()
    $authed.set(false)
    throw new AuthError('unauthorized')
  }
  if (!response.ok) throw new ApiError(response.status)
  return response.json() as Promise<T>
}

export async function signIn(pin: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
  } catch {
    // Never reached the server at all — a dead origin, no signal, or CORS.
    throw new SignInFailed('offline')
  }

  if (response.status === 400 || response.status === 401) throw new SignInFailed('pin')
  if (!response.ok) throw new SignInFailed('server')

  const { token } = (await response.json()) as { token: string }
  setToken(token)
  $authed.set(true)
  await sync()
}

export function signOut(): void {
  clearSession()
  $authed.set(false)
  $events.set([])
}

/** Local write first, network later — the tap must never wait on a round trip. */
async function record(event: PupEvent): Promise<PupEvent> {
  await saveEvents([event])
  setOutbox([...new Set([...getOutbox(), event.id])])

  const next = [event, ...$events.get().filter((e) => e.id !== event.id)]
  next.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  $events.set(next)
  $sync.setKey('pending', getOutbox().length)

  void sync()
  return event
}

export function log(event: DraftEvent): Promise<PupEvent> {
  return record(eventSchema.parse({ ...event, id: crypto.randomUUID(), deletedAt: null }))
}

/** Notes are the one field that stays editable after the fact. */
export async function annotate(id: string, note: string | null): Promise<void> {
  const existing = $events.get().find((event) => event.id === id)
  if (!existing || existing.note === note) return
  await record({ ...existing, note })
}

/** Undo is a tombstone so it reaches the other devices too. */
export async function undo(id: string): Promise<void> {
  const existing = $events.get().find((event) => event.id === id)
  if (!existing) return
  await record({ ...existing, deletedAt: new Date().toISOString() })
}

async function push(): Promise<void> {
  const pending = getOutbox()
  if (!pending.length) return

  const byId = new Map($events.get().map((event) => [event.id, event]))
  const batch = pending.map((id) => byId.get(id)).filter((e): e is PupEvent => Boolean(e))

  // Ids with no matching event can never be sent; drop them.
  if (!batch.length) {
    setOutbox([])
    return
  }

  const sent = new Set(batch.map((event) => event.id))

  try {
    await api('/api/events', { method: 'POST', body: JSON.stringify(batch) })
  } catch (error) {
    // A 4xx means the server will never accept this batch — a malformed event,
    // or one referencing a dog that no longer exists. Leaving it queued wedges
    // the outbox permanently and every later entry silently stops syncing, so
    // drop it and let the queue drain. 5xx and network failures are transient
    // and stay put.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      setOutbox(getOutbox().filter((id) => !sent.has(id)))
    }
    throw error
  }

  setOutbox(getOutbox().filter((id) => !sent.has(id)))
}

async function pull(): Promise<void> {
  let cursor = getCursor()
  let more = true

  while (more) {
    const query = cursor ? `?since=${encodeURIComponent(cursor)}` : ''
    const page = await api<{ events: unknown[]; cursor: string | null; more: boolean }>(
      `/api/events${query}`,
    )

    const fresh = page.events
      .map((row) => eventSchema.safeParse(row))
      .filter((r) => r.success)
      .map((r) => r.data)

    if (fresh.length) {
      await saveEvents(fresh)
      const merged = new Map($events.get().map((event) => [event.id, event]))
      for (const event of fresh) merged.set(event.id, event)
      $events.set([...merged.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)))
    }

    cursor = page.cursor
    more = page.more
    if (cursor) setCursor(cursor)
  }
}

let inFlight: Promise<void> | null = null

export function sync(): Promise<void> {
  if (inFlight) return inFlight
  if (!getToken()) return Promise.resolve()

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    $sync.set({ ...$sync.get(), status: 'offline', pending: getOutbox().length })
    return Promise.resolve()
  }

  $sync.setKey('status', 'syncing')
  inFlight = (async () => {
    try {
      await push()
      await pull()
      const { dogs } = await api<{ dogs: Dog[] }>('/api/dogs')
      $dogs.set(dogs)
      $sync.set({ status: 'idle', pending: getOutbox().length, lastSyncedAt: new Date().toISOString() })
    } catch (error) {
      if (!(error instanceof AuthError)) {
        $sync.set({ ...$sync.get(), status: 'error', pending: getOutbox().length })
      }
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export async function renameDog(id: string, name: string): Promise<void> {
  const { dog } = await api<{ dog: Dog }>('/api/dogs', {
    method: 'PATCH',
    body: JSON.stringify({ id, name }),
  })
  $dogs.set($dogs.get().map((d) => (d.id === dog.id ? dog : d)))
}

const SYNC_INTERVAL_MS = 30_000

/** Show local data immediately, then reconcile with the server in the background. */
export async function start(): Promise<() => void> {
  $events.set(await loadEvents())
  $sync.setKey('pending', getOutbox().length)
  $authed.set(Boolean(getToken()))
  $ready.set(true)

  void sync()

  const onOnline = () => void sync()
  const onVisible = () => document.visibilityState === 'visible' && void sync()
  const timer = setInterval(() => void sync(), SYNC_INTERVAL_MS)

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    clearInterval(timer)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
