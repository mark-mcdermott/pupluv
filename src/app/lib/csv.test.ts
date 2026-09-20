import { describe, expect, it } from 'vitest'
import { eventSchema, type Dog, type PupEvent } from '@/lib/domain'
import { csvFilename, toCsv } from './csv'

const RAMEN = '11111111-1111-4111-8111-111111111111'
const OREO = '22222222-2222-4222-8222-222222222222'

const DOGS: Dog[] = [
  { id: RAMEN, name: 'Ramen', accent: 'teal', emoji: '🍜' },
  { id: OREO, name: 'Oreo', accent: 'amber', emoji: '🍪' },
]

let uid = 0
function event(fields: Record<string, unknown>): PupEvent {
  return eventSchema.parse({
    id: `99999999-9999-4999-8999-${String(++uid).padStart(12, '0')}`,
    dogId: RAMEN,
    ...fields,
  })
}

/** Local, so the fixtures do not shift with the runner's timezone. */
function localIso(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

function rows(csv: string): string[][] {
  return csv.split('\r\n').map((line) => line.split(','))
}

describe('toCsv', () => {
  it('heads the file with its columns', () => {
    expect(toCsv([], DOGS)).toBe(
      'date,time,weekday,hour,dog,event,place,potty,accident,note,occurred_at',
    )
  })

  it('writes the local day and hour, not UTC', () => {
    const csv = toCsv(
      [
        event({
          type: 'potty',
          occurredAt: localIso(2026, 9, 19, 23, 5),
          location: 'inside',
          pottyKind: 'pee',
        }),
      ],
      DOGS,
    )
    const [, entry] = rows(csv)
    expect(entry!.slice(0, 4)).toEqual(['2026-09-19', '23:05', 'Sat', '23'])
  })

  it('derives the accident, and leaves it blank where the idea does not apply', () => {
    const csv = toCsv(
      [
        event({ type: 'potty', occurredAt: localIso(2026, 9, 19, 7), location: 'inside', pottyKind: 'poo' }),
        event({ type: 'potty', occurredAt: localIso(2026, 9, 19, 8), location: 'outside', pottyKind: 'pee' }),
        event({ type: 'bark', occurredAt: localIso(2026, 9, 19, 9), location: 'inside' }),
      ],
      DOGS,
    )
    expect(rows(csv).slice(1).map((r) => [r[5], r[6], r[8]])).toEqual([
      ['potty', 'inside', 'true'],
      ['potty', 'outside', 'false'],
      ['bark', 'inside', ''],
    ])
  })

  it('names the dog rather than its id', () => {
    const csv = toCsv(
      [event({ dogId: OREO, type: 'location', occurredAt: localIso(2026, 9, 19, 7), location: 'pen' })],
      DOGS,
    )
    expect(rows(csv)[1]![4]).toBe('Oreo')
  })

  it('orders oldest first, whatever order it is handed', () => {
    const csv = toCsv(
      [
        event({ type: 'location', occurredAt: localIso(2026, 9, 19, 18), location: 'bed' }),
        event({ type: 'location', occurredAt: localIso(2026, 9, 19, 6), location: 'pen' }),
        event({ type: 'location', occurredAt: localIso(2026, 9, 19, 12), location: 'outside' }),
      ],
      DOGS,
    )
    expect(rows(csv).slice(1).map((r) => r[1])).toEqual(['06:00', '12:00', '18:00'])
  })

  it('leaves out what was deleted', () => {
    const csv = toCsv(
      [
        event({ type: 'location', occurredAt: localIso(2026, 9, 19, 6), location: 'pen' }),
        event({
          type: 'location',
          occurredAt: localIso(2026, 9, 19, 7),
          location: 'outside',
          deletedAt: localIso(2026, 9, 19, 8),
        }),
      ],
      DOGS,
    )
    expect(rows(csv)).toHaveLength(2)
  })

  it('quotes a note holding a comma, and doubles a quote inside one', () => {
    const csv = toCsv(
      [
        event({
          type: 'bark',
          occurredAt: localIso(2026, 9, 19, 6),
          location: 'pen',
          note: 'loud, then "quiet"',
        }),
      ],
      DOGS,
    )
    expect(csv.split('\r\n')[1]).toContain('"loud, then ""quiet"""')
  })
})

describe('csvFilename', () => {
  it('carries the day it was taken', () => {
    expect(csvFilename(new Date(2026, 8, 19))).toBe('pupluv-2026-09-19.csv')
  })
})
