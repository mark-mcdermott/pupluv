import type { PupEvent } from '@/lib/domain'
import type { Event as EventRow, NewEvent } from './db/schema'

/** The union collapses into one flat row; the table's CHECKs keep it honest. */
export function toRow(event: PupEvent): NewEvent {
  return {
    id: event.id,
    dogId: event.dogId,
    type: event.type,
    occurredAt: new Date(event.occurredAt),
    note: event.note,
    deletedAt: event.deletedAt ? new Date(event.deletedAt) : null,
    endedAt: event.type === 'sleep' && event.endedAt ? new Date(event.endedAt) : null,
    location:
      event.type === 'sleep' || event.type === 'water' ? null : event.location,
    pottyKind: event.type === 'potty' ? event.pottyKind : null,
    amount:
      event.type === 'water'
        ? event.amount.toFixed(2)
        : event.type === 'meal' && event.amount !== null
          ? event.amount.toFixed(2)
          : null,
  }
}

export function fromRow(row: EventRow): PupEvent {
  const base = {
    id: row.id,
    dogId: row.dogId,
    occurredAt: row.occurredAt.toISOString(),
    note: row.note,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  }
  switch (row.type) {
    case 'location':
      return { ...base, type: 'location', location: row.location! }
    case 'potty':
      return { ...base, type: 'potty', location: row.location!, pottyKind: row.pottyKind! }
    case 'bark':
      return { ...base, type: 'bark', location: row.location! }
    case 'meal':
      return {
        ...base,
        type: 'meal',
        location: row.location!,
        amount: row.amount === null ? null : Number(row.amount),
      }
    case 'water':
      return { ...base, type: 'water', amount: Number(row.amount) }
    case 'sleep':
      return { ...base, type: 'sleep', endedAt: row.endedAt?.toISOString() ?? null }
  }
}
