import { createStore, delMany, entries, setMany } from 'idb-keyval'
import { eventSchema, type PupEvent } from '@/lib/domain'

// Events live in IndexedDB — a few thousand a year outgrows localStorage's
// 5 MB, and per-key writes keep logging O(1) rather than rewriting the lot.
//
// Opened lazily: `createStore` touches `indexedDB` immediately, and doing that
// while the module evaluates would take the whole island down wherever the API
// is missing or blocked. Without it the app still works against the server, it
// just loses the offline cache.
let store: ReturnType<typeof createStore> | null = null

function eventStore() {
  store ??= createStore('pupluv', 'events')
  return store
}

export async function loadEvents(): Promise<PupEvent[]> {
  let rows: [string, unknown][]
  try {
    rows = await entries<string, unknown>(eventStore())
  } catch {
    return []
  }
  const events: PupEvent[] = []
  const corrupt: string[] = []

  for (const [key, value] of rows) {
    const parsed = eventSchema.safeParse(value)
    if (parsed.success) events.push(parsed.data)
    else corrupt.push(key)
  }

  // A row that no longer matches the schema can never sync; drop it rather than
  // letting it wedge the outbox forever.
  if (corrupt.length) await delMany(corrupt, eventStore()).catch(() => {})

  return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

export async function saveEvents(batch: PupEvent[]): Promise<void> {
  if (!batch.length) return
  try {
    await setMany(
      batch.map((event) => [event.id, event] as const),
      eventStore(),
    )
  } catch {
    // Degrade to online-only: the event is already in memory and the outbox.
  }
}
