import { useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { POTTY_GLYPHS, POTTY_LABELS, isAccident, isLive, type Dog, type PupEvent } from '@/lib/domain'
import { annotate, undo } from '../lib/sync'
import { clockLabel, dayKey, dayLabel } from '../lib/time'
import { DOG_GLYPH_PX, Glyph, PlaceGlyph } from './Place'

const MOVED = {
  pen: 'Moved to the pen',
  outside: 'Moved outside',
  inside: 'Moved inside',
  crate: 'Crated',
  bed: 'Onto our bed',
} as const
const AT = {
  pen: 'in the pen',
  outside: 'outside',
  inside: 'inside',
  crate: 'in the crate',
  bed: 'in our bed',
} as const

/** Entries logged together share a timestamp and every other field. */
function signature(event: PupEvent): string {
  const parts = [event.occurredAt, event.type, event.note ?? '']
  switch (event.type) {
    case 'location':
      parts.push(event.location)
      break
    case 'potty':
      parts.push(event.location, event.pottyKind)
      break
    case 'meal':
    case 'water':
      parts.push(String(event.amount))
      break
    case 'sleep':
      parts.push(event.endedAt ?? '')
      break
  }
  return parts.join('|')
}

function describe(event: PupEvent): string {
  switch (event.type) {
    case 'potty':
      return `${POTTY_LABELS[event.pottyKind]} ${AT[event.location]}`
    case 'location':
      return MOVED[event.location]
    case 'meal':
      return `Ate ${event.amount} cups`
    case 'water':
      return `Drank ${event.amount} oz`
    case 'sleep':
      return 'Crated to sleep'
  }
}

type Entry = { key: string; events: PupEvent[] }
type Day = { key: string; label: string; entries: Entry[] }

/**
 * Collapses a both-dogs batch into one row, then files rows under their day.
 * Sorts rather than trusting the caller: sync happens to hand these over newest
 * first, but a list that renders out of order when it is not is a trap.
 */
function byDay(events: PupEvent[]): Day[] {
  const days: Day[] = []
  const dayAt = new Map<string, number>()
  const entryAt = new Map<string, number>()

  const newestFirst = events
    .filter(isLive)
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

  for (const event of newestFirst) {

    const key = dayKey(event.occurredAt)
    let index = dayAt.get(key)
    if (index === undefined) {
      index = days.length
      dayAt.set(key, index)
      days.push({ key, label: dayLabel(event.occurredAt), entries: [] })
    }

    const entryKey = signature(event)
    const existing = entryAt.get(entryKey)
    if (existing === undefined) {
      entryAt.set(entryKey, days[index]!.entries.length)
      days[index]!.entries.push({ key: entryKey, events: [event] })
    } else {
      days[index]!.entries[existing]!.events.push(event)
    }
  }

  return days
}

export function Timeline({ dogs, events }: { dogs: Dog[]; events: PupEvent[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const byId = new Map(dogs.map((dog) => [dog.id, dog]))
  const days = byDay(events)

  function open(key: string, note: string | null) {
    setEditing(key)
    setDraft(note ?? '')
  }

  async function commit(group: PupEvent[]) {
    setEditing(null)
    const note = draft.trim() || null
    await Promise.all(group.map((event) => annotate(event.id, note)))
  }

  if (days.length === 0) {
    return (
      <section className="mt-7">
        <h2 className="text-sm font-semibold text-ink-muted">Today</h2>
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
          Nothing logged yet today. Use the buttons below the moment it happens.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-7">
      {days.map((day, index) => (
        <div
          key={day.key}
          // A rule between days, but none trailing off the end of the list.
          className={index < days.length - 1 ? 'mb-5 border-b border-line pb-5' : ''}
        >
          <h2 className="text-sm font-semibold text-ink-muted">{day.label}</h2>

          <ol className="mt-2 border-l border-line pl-4">
            {day.entries.map(({ key, events: group }) => {
              const first = group[0]!
              const accident = isAccident(first)
              const who = group.map((event) => byId.get(event.dogId)).filter(Boolean) as Dog[]
              const label = `${who.map((dog) => dog.name).join(' and ')}: ${describe(first)}`
              const place =
                first.type === 'location' || first.type === 'potty' ? first.location : null

              return (
                <li key={key} className="relative py-2">
                  {accident ? (
                    <span
                      className="absolute -left-[1.1875rem] top-4 size-1.5 rounded-full bg-clay"
                      title="Accident"
                      aria-hidden
                    />
                  ) : null}

                  <div className="flex items-baseline gap-2">
                    <time
                      className="w-[4.5rem] shrink-0 whitespace-nowrap text-sm text-ink-faint"
                      dateTime={first.occurredAt}
                    >
                      {clockLabel(first.occurredAt)}
                    </time>
                    <span
                      className="w-14 shrink-0 leading-none"
                      style={{ fontSize: DOG_GLYPH_PX }}
                      role="img"
                      aria-label={who.map((dog) => dog.name).join(' and ')}
                    >
                      {who.map((dog) => dog.emoji).join('')}
                    </span>

                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-ink">
                      {place ? <PlaceGlyph location={place} /> : null}
                      {first.type === 'potty' ? (
                        <Glyph
                          text={POTTY_GLYPHS[first.pottyKind]}
                          label={POTTY_LABELS[first.pottyKind]}
                        />
                      ) : first.type !== 'location' ? (
                        <span className="truncate">{describe(first)}</span>
                      ) : null}
                    </span>

                    <button
                      type="button"
                      onClick={() => open(key, first.note)}
                      aria-label={`${first.note ? 'Edit' : 'Add'} note for ${label}`}
                      title={first.note ? 'Edit note' : 'Add note'}
                      className="press grid size-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunk hover:text-ink"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => group.forEach((event) => void undo(event.id))}
                      aria-label={`Remove: ${label}`}
                      title="Remove"
                      className="press grid size-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunk hover:text-ink"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {editing === key ? (
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(change) => setDraft(change.target.value)}
                      onBlur={() => void commit(group)}
                      onKeyDown={(pressed) => {
                        if (pressed.key === 'Escape') setEditing(null)
                      }}
                      rows={2}
                      maxLength={500}
                      placeholder="Add a note…"
                      aria-label={`Note for ${label}`}
                      className="mt-1.5 ml-20 w-[calc(100%-5rem)] resize-none rounded-xl border border-line bg-surface px-2 py-1.5 text-sm outline-none placeholder:text-ink-faint focus-visible:border-ink"
                    />
                  ) : first.note ? (
                    <p className="ml-20 mt-0.5 text-xs leading-snug text-ink-muted">{first.note}</p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </section>
  )
}
