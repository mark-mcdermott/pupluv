import { Pencil, X } from 'lucide-react'
import { POTTY_GLYPHS, POTTY_LABELS, isAccident, isLive, type Dog, type PupEvent } from '@/lib/domain'
import { undo } from '../lib/sync'
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

/**
 * Entries logged together share a timestamp and every other field. A potty
 * logged with a move shares the instant and the place, and keys the same: they
 * were one entry, and the move is how the potty got its location. Two rows a
 * pixel apart saying nearly the same thing is not what happened.
 */
function signature(event: PupEvent): string {
  switch (event.type) {
    case 'location':
    case 'potty':
      return `${event.occurredAt}|place|${event.location}`
    case 'meal':
    case 'water':
      return `${event.occurredAt}|${event.type}|${event.amount}`
    case 'sleep':
      return `${event.occurredAt}|sleep|${event.endedAt ?? ''}`
  }
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

type Props = {
  dogs: Dog[]
  events: PupEvent[]
  /** The entry the deck is editing, so its row can say so. */
  editing?: PupEvent[] | null
  onEdit?: (group: PupEvent[]) => void
}

export function Timeline({ dogs, events, editing = null, onEdit }: Props) {
  const days = byDay(events)

  // With nothing but moves on screen there is no potty column to line up, and
  // reserving one strands the controls out at the right edge.
  const anyPotty = days.some((day) =>
    day.entries.some((entry) => entry.events.some((event) => event.type === 'potty')),
  )

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
              // A move logged with a potty is in this group too; the potty is
              // the one that describes it.
              const lead = group.find((event) => event.type === 'potty') ?? group[0]!
              const accident = isAccident(lead)
              const beingEdited = Boolean(
                editing?.some((event) => group.some((member) => member.id === event.id)),
              )
              // Ordered by the dog list, not by event order — so a pair always
              // reads the same way round, and the same way as the deck.
              const who = dogs.filter((dog) => group.some((event) => event.dogId === dog.id))
              const label = `${who.map((dog) => dog.name).join(' and ')}: ${describe(lead)}`
              const place =
                lead.type === 'location' || lead.type === 'potty' ? lead.location : null

              return (
                <li
                  key={key}
                  // Lifted off the ground while the deck below holds it, so the
                  // controls down there plainly belong to this row.
                  className={`relative py-2 ${beingEdited ? 'rounded-xl bg-surface' : ''}`}
                >
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
                      dateTime={lead.occurredAt}
                    >
                      {clockLabel(lead.occurredAt)}
                    </time>
                    <span
                      className="flex w-[3.1875rem] shrink-0 gap-1 leading-none"
                      style={{ fontSize: DOG_GLYPH_PX }}
                      role="img"
                      aria-label={who.map((dog) => dog.name).join(' and ')}
                    >
                      {who.map((dog) => (
                        <span key={dog.id}>{dog.emoji}</span>
                      ))}
                    </span>

                    <span
                      // Air on both sides in one declaration, so the two can never
                      // drift apart the way a dog-column width and a control
                      // margin would. Set to match the gap the time leaves before
                      // the dogs.
                      className={`mx-2.5 flex min-w-0 items-center gap-1.5 text-sm text-ink ${
                        anyPotty ? 'flex-1' : ''
                      }`}
                    >
                      {place ? <PlaceGlyph location={place} /> : null}
                      {lead.type === 'potty' ? (
                        <Glyph
                          text={POTTY_GLYPHS[lead.pottyKind]}
                          label={POTTY_LABELS[lead.pottyKind]}
                        />
                      ) : lead.type !== 'location' ? (
                        <span className="truncate">{describe(lead)}</span>
                      ) : null}
                    </span>

                    {/* The pair sits as close as the two dogs do. Only the facing
                        edges are trimmed — the outer padding keeps both tap
                        targets full height and near full width. */}
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => onEdit?.(group)}
                        aria-label={`Edit: ${label}`}
                        title="Edit"
                        className="press grid h-7 place-items-center pl-2 pr-[3px] text-ink-faint hover:text-ink"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => group.forEach((event) => void undo(event.id))}
                        aria-label={`Remove: ${label}`}
                        title="Remove"
                        className="press grid h-7 place-items-center pl-px pr-2 text-ink-faint hover:text-ink"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  </div>

                  {lead.note ? (
                    <p className="ml-20 mt-0.5 text-xs leading-snug text-ink-muted">{lead.note}</p>
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
