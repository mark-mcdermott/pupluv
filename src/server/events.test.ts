import { describe, expect, it } from 'vitest'
import { eventSchema, type PupEvent } from '@/lib/domain'
import { fromRow, toRow } from './events'
import type { Event as EventRow } from './db/schema'

const DOG = '11111111-1111-4111-8111-111111111111'
const ID = '44444444-4444-4444-8444-444444444444'

/** The database hands back Dates and numeric strings; the round trip must survive it. */
function asRow(event: PupEvent): EventRow {
  const row = toRow(event)
  return { ...row, createdAt: new Date('2026-09-16T10:00:00Z') } as EventRow
}

describe('toRow / fromRow', () => {
  it('round-trips a potty event', () => {
    const event = eventSchema.parse({
      id: ID,
      dogId: DOG,
      type: 'potty',
      occurredAt: '2026-09-16T10:00:00.000Z',
      location: 'pen',
      pottyKind: 'both',
    })
    expect(fromRow(asRow(event))).toEqual(event)
  })

  it('round-trips a meal amount through numeric(6,2)', () => {
    const event = eventSchema.parse({
      id: ID,
      dogId: DOG,
      type: 'meal',
      occurredAt: '2026-09-16T10:00:00.000Z',
      location: 'inside',
      amount: 1.25,
    })
    expect(fromRow(asRow(event))).toEqual(event)
  })

  it('round-trips a meal with no amount', () => {
    const event = eventSchema.parse({
      id: ID,
      dogId: DOG,
      type: 'meal',
      occurredAt: '2026-09-16T10:00:00.000Z',
      location: 'inside',
    })
    expect(toRow(event).amount).toBeNull()
    expect(fromRow(asRow(event))).toEqual(event)
  })

  it('nulls the columns that do not belong to the event type', () => {
    const row = toRow(
      eventSchema.parse({
        id: ID,
        dogId: DOG,
        type: 'location',
        occurredAt: '2026-09-16T10:00:00.000Z',
        location: 'outside',
      }),
    )
    expect(row).toMatchObject({ pottyKind: null, amount: null, endedAt: null })
  })
})
