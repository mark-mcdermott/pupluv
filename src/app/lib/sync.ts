import {
  currentLocation,
  eventSchema,
  type Dog,
  type DraftEvent,
  type Location,
  type PupEvent,
} from '@/lib/domain'
import { API_BASE } from './api'
import { authClient } from './auth-client'
import { SignInFailed, type SignInReason } from './errors'
import { publishToWidget, takeWidgetEvents } from './native'
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

/**
 * Better Auth reports a refused attempt as an `error` object but throws when the
 * request never got an answer at all, and a thrown promise from a form action
 * unmounts the React tree. Both become a SignInFailed the form can read.
 */
async function attempt(
  call: () => Promise<{ error?: { status?: number; code?: string } | null }>,
  refused: SignInReason,
): Promise<void> {
  let error: { status?: number; code?: string } | null | undefined
  try {
    ;({ error } = await call())
  } catch {
    throw new SignInFailed('offline')
  }
  if (!error) return
  if (error.code === 'USER_ALREADY_EXISTS') throw new SignInFailed('taken')
  if (error.code === 'PASSWORD_TOO_SHORT') throw new SignInFailed('weak')
  throw new SignInFailed(error.status && error.status >= 500 ? 'server' : refused)
}

async function started(): Promise<void> {
  $authed.set(true)
  await sync()
}

export async function signIn(email: string, password: string): Promise<void> {
  await attempt(() => authClient.signIn.email({ email, password }), 'credentials')
  await started()
}

export async function signUp(email: string, password: string, name: string): Promise<void> {
  await attempt(() => authClient.signUp.email({ email, password, name }), 'credentials')
  await started()
}

export async function signOut(): Promise<void> {
  // Server first, so the session row goes with it; the local clear happens
  // either way, because a session we cannot reach is still one we are done with.
  try {
    await authClient.signOut()
  } catch {
    /* offline — the token expires on its own */
  }
  clearSession()
  $authed.set(false)
  $events.set([])
  $dogs.set([])
  // The widget must stop offering to log for an account we no longer hold.
  void publishToWidget({ token: null, apiBase: API_BASE, dogs: [], placements: {} })
}

/**
 * A dog is the one thing written straight to the server rather than through the
 * outbox: every event references one, so a dog that exists only on this device
 * would have its entries rejected as an unknown dog by the very check that keeps
 * accounts apart.
 */
export async function addDog(dog: Omit<Dog, 'id'>): Promise<Dog> {
  const { dog: created } = await api<{ dog: Dog }>('/api/dogs', {
    method: 'POST',
    body: JSON.stringify(dog),
  })
  $dogs.set([...$dogs.get(), created])
  void sync()
  return created
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

/** Events the widget logged while offline become ours to deliver. */
async function adoptWidgetEvents(): Promise<void> {
  const queued = await takeWidgetEvents()
  if (!queued.length) return

  await saveEvents(queued)
  const merged = new Map($events.get().map((event) => [event.id, event]))
  for (const event of queued) merged.set(event.id, event)
  $events.set([...merged.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)))
  setOutbox([...new Set([...getOutbox(), ...queued.map((event) => event.id)])])
}

function placementsByDog(dogs: Dog[], events: PupEvent[]): Record<string, Location> {
  const placements: Record<string, Location> = {}
  for (const dog of dogs) {
    const place = currentLocation(events, dog.id)
    if (place) placements[dog.id] = place
  }
  return placements
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
      await adoptWidgetEvents()
      await push()
      await pull()
      const { dogs } = await api<{ dogs: Dog[] }>('/api/dogs')
      $dogs.set(dogs)
      await publishToWidget({
        token: getToken(),
        apiBase: API_BASE,
        dogs,
        placements: placementsByDog(dogs, $events.get()),
      })
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
