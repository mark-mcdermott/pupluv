import { describe, expect, it } from 'vitest'
import {
  currentLocation,
  eventSchema,
  isAccident,
  latestLocationEvent,
  tallyPotty,
  type PupEvent,
} from './domain'

const DOG = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

let seq = 0
const id = () => `33333333-3333-4333-8333-${String(++seq).padStart(12, '0')}`

function potty(
  location: 'pen' | 'outside' | 'inside' | 'crate' | 'bed',
  occurredAt: string,
  dogId = DOG,
  deletedAt: string | null = null,
): PupEvent {
  return eventSchema.parse({
    id: id(),
    dogId,
    type: 'potty',
    occurredAt,
    location,
    pottyKind: 'pee',
    deletedAt,
  })
}

function moved(
  location: 'pen' | 'outside' | 'inside' | 'crate' | 'bed',
  occurredAt: string,
): PupEvent {
  return eventSchema.parse({ id: id(), dogId: DOG, type: 'location', occurredAt, location })
}

describe('isAccident', () => {
  it('treats anything but outside as an accident', () => {
    expect(isAccident(potty('outside', '2026-09-16T10:00:00Z'))).toBe(false)
    for (const place of ['inside', 'pen', 'crate', 'bed'] as const) {
      expect(isAccident(potty(place, '2026-09-16T10:00:00Z'))).toBe(true)
    }
  })

  it('is not a property of non-potty events', () => {
    expect(isAccident(moved('inside', '2026-09-16T10:00:00Z'))).toBe(false)
  })
})

describe('currentLocation', () => {
  it('is the most recent location event regardless of insertion order', () => {
    const events = [
      moved('pen', '2026-09-16T08:00:00Z'),
      moved('outside', '2026-09-16T12:00:00Z'),
      moved('inside', '2026-09-16T09:00:00Z'),
    ]
    expect(currentLocation(events, DOG)).toBe('outside')
  })

  it('ignores a location that was undone', () => {
    const undone = eventSchema.parse({
      id: id(),
      dogId: DOG,
      type: 'location',
      occurredAt: '2026-09-16T12:00:00Z',
      location: 'outside',
      deletedAt: '2026-09-16T12:01:00Z',
    })
    expect(currentLocation([moved('pen', '2026-09-16T08:00:00Z'), undone], DOG)).toBe('pen')
  })

  it('is null for a dog with nothing logged', () => {
    expect(currentLocation([moved('pen', '2026-09-16T08:00:00Z')], OTHER)).toBeNull()
    expect(latestLocationEvent([], DOG)).toBeNull()
  })
})

describe('tallyPotty', () => {
  const since = new Date('2026-09-10T00:00:00Z')

  it('splits outside from accidents for one dog only', () => {
    const events = [
      potty('outside', '2026-09-15T10:00:00Z'),
      potty('inside', '2026-09-15T11:00:00Z'),
      potty('pen', '2026-09-15T12:00:00Z'),
      potty('inside', '2026-09-15T13:00:00Z', OTHER),
    ]
    expect(tallyPotty(events, DOG, since)).toEqual({ outside: 1, accidents: 2, total: 3 })
  })

  it('excludes events before the window and undone events', () => {
    const events = [
      potty('outside', '2026-09-01T10:00:00Z'),
      potty('outside', '2026-09-15T10:00:00Z', DOG, '2026-09-15T10:05:00Z'),
      potty('inside', '2026-09-15T11:00:00Z'),
    ]
    expect(tallyPotty(events, DOG, since)).toEqual({ outside: 0, accidents: 1, total: 1 })
  })

  it('reports an empty window rather than dividing by zero', () => {
    expect(tallyPotty([], DOG, since)).toEqual({ outside: 0, accidents: 0, total: 0 })
  })
})

describe('eventSchema', () => {
  it('rejects a potty event that is missing its location', () => {
    const result = eventSchema.safeParse({
      id: id(),
      dogId: DOG,
      type: 'potty',
      occurredAt: '2026-09-16T10:00:00Z',
      pottyKind: 'pee',
    })
    expect(result.success).toBe(false)
  })

  it('keeps the union arms distinct', () => {
    const meal = eventSchema.parse({
      id: id(),
      dogId: DOG,
      type: 'meal',
      occurredAt: '2026-09-16T10:00:00Z',
      amount: 1.5,
    })
    expect(meal).toMatchObject({ type: 'meal', amount: 1.5 })
  })
})

describe('the five places', () => {
  it('accepts the sleeping places the dogs actually use', () => {
    for (const place of ['crate', 'bed'] as const) {
      // Read it back through currentLocation rather than narrowing the union by
      // hand — that is how the app asks the question anyway.
      expect(currentLocation([moved(place, '2026-09-16T22:00:00Z')], DOG)).toBe(place)
    }
  })

  it('tracks a move into the crate as the current location', () => {
    const events = [moved('inside', '2026-09-16T20:00:00Z'), moved('crate', '2026-09-16T22:00:00Z')]
    expect(currentLocation(events, DOG)).toBe('crate')
  })

  it('counts a bed accident against the weekly tally', () => {
    const tally = tallyPotty(
      [potty('outside', '2026-09-15T10:00:00Z'), potty('bed', '2026-09-15T23:00:00Z')],
      DOG,
      new Date('2026-09-10T00:00:00Z'),
    )
    expect(tally).toEqual({ outside: 1, accidents: 1, total: 2 })
  })
})
