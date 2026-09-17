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
