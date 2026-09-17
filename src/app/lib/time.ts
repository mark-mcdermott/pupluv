/** "how long has the dog been out there" — the only duration the UI shows. */
export function sinceLabel(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function startOfToday(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

export function daysAgo(days: number): Date {
  const date = startOfToday()
  date.setDate(date.getDate() - days)
  return date
}

/** Identity of the local calendar day an event belongs to. */
export function dayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * "Today", "Yesterday", then "Thu 9/26". Built by hand rather than with a single
 * toLocaleDateString call, which renders this combination with a comma.
 */
export function dayLabel(iso: string): string {
  if (isSameDay(iso, startOfToday())) return 'Today'
  if (isSameDay(iso, daysAgo(1))) return 'Yesterday'
  const date = new Date(iso)
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' })
  const short = date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
  return `${weekday} ${short}`
}

export function isSameDay(iso: string, day: Date): boolean {
  const date = new Date(iso)
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  )
}

/** The value a `datetime-local` input wants: local wall time, no zone. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (part: number) => String(part).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/**
 * Back the other way. Null for the empty or half-typed value the input reports
 * mid-edit, which must not be written as a date.
 *
 * The shape is checked before parsing because `new Date('2026-09-')` is not an
 * error — it is the first of September. A half-typed value would otherwise move
 * an entry a fortnight without saying so.
 */
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? null : date.toISOString()
}
