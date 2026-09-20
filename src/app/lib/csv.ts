import { isAccident, isLive, placeOf, type Dog, type PupEvent } from '@/lib/domain'

/**
 * One row per event, oldest first, with the few things a spreadsheet cannot
 * work out for itself already worked out.
 *
 * `date`, `time` and `weekday` are local, not UTC: the question this data
 * answers is "when do accidents happen", and 11pm Saturday is the answer — not
 * the instant it maps to in another zone. `hour` is there so a pivot can group
 * by it without parsing anything, and `accident` because it is derived from the
 * location rather than stored, so a column of it saves rebuilding the rule.
 */
const COLUMNS = [
  'date',
  'time',
  'weekday',
  'hour',
  'dog',
  'event',
  'place',
  'potty',
  'accident',
  'note',
  'occurred_at',
] as const

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** A field needs quoting if it holds a comma, a quote or a line break. */
function escape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function row(event: PupEvent, dogName: string): string[] {
  const at = new Date(event.occurredAt)
  const place = placeOf(event)
  return [
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    `${pad(at.getHours())}:${pad(at.getMinutes())}`,
    WEEKDAYS[at.getDay()]!,
    String(at.getHours()),
    dogName,
    event.type,
    place ?? '',
    event.type === 'potty' ? event.pottyKind : '',
    // Only an elimination can be one, so the column is blank rather than false
    // for everything else — a bark in the house is not an accident.
    event.type === 'potty' ? String(isAccident(event)) : '',
    event.note ?? '',
    event.occurredAt,
  ]
}

export function toCsv(events: PupEvent[], dogs: Dog[]): string {
  const names = new Map(dogs.map((dog) => [dog.id, dog.name]))
  const rows = events
    .filter(isLive)
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((event) => row(event, names.get(event.dogId) ?? event.dogId))

  return [COLUMNS, ...rows].map((cells) => cells.map(escape).join(',')).join('\r\n')
}

export function csvFilename(now: Date = new Date()): string {
  return `pupluv-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`
}
