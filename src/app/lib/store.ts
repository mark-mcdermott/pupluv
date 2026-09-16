import { createStore, delMany, entries, setMany } from 'idb-keyval'
import { eventSchema, type PupEvent } from '@/lib/domain'

// Events live in IndexedDB — a few thousand a year outgrows localStorage's
// 5 MB, and per-key writes keep logging O(1) rather than rewriting the lot.
const store = createStore('pupluv', 'events')

export async function loadEvents(): Promise<PupEvent[]> {
  const rows = await entries<string, unknown>(store)
  const events: PupEvent[] = []
  const corrupt: string[] = []

  for (const [key, value] of rows) {
    const parsed = eventSchema.safeParse(value)
    if (parsed.success) events.push(parsed.data)
    else corrupt.push(key)
  }

  // A row that no longer matches the schema can never sync; drop it rather than
  // letting it wedge the outbox forever.
  if (corrupt.length) await delMany(corrupt, store)

  return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

export async function saveEvents(events: PupEvent[]): Promise<void> {
  if (!events.length) return
  await setMany(
    events.map((event) => [event.id, event] as const),
    store,
  )
}
