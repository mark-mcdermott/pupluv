import {
  MARKS,
  POTTY_GLYPHS,
  POTTY_LABELS,
  isAccident,
  isLive,
  isMark,
  placeOf,
  type Dog,
  type MarkType,
  type PupEvent,
} from '@/lib/domain'
import { clockLabel, dayKey, dayLabel } from '../lib/time'
import { DOG_GLYPH_PX, Glyph, PlaceGlyph } from './Place'

/** Fixed order, so a row with two of them always reads the same way round. */
const markTypes = Object.keys(MARKS) as MarkType[]

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
  // Everything filed at the same place and instant is one entry, however many
  // kinds it took to say it — which is what folds a tap that logged a pee, a
  // bark and a move back into a single row. A drink is the only kind with
  // nowhere to be filed.
  if (event.type === 'water') return `${event.occurredAt}|water|${event.amount}`
  return `${event.occurredAt}|place|${event.location}`
}

function describe(event: PupEvent): string {
  switch (event.type) {
    case 'potty':
      return `${POTTY_LABELS[event.pottyKind]} ${AT[event.location]}`
    case 'location':
      return MOVED[event.location]
    case 'water':
      return `Drank ${event.amount} oz`
    case 'meal':
      return event.amount
        ? `${MARKS.meal.label} ${event.amount} cups`
        : `${MARKS.meal.label} ${AT[event.location]}`
    case 'bark':
    case 'sleep':
      return `${MARKS[event.type].label} ${AT[event.location]}`
  }
}

type Entry = { key: string; events: PupEvent[] }
type Day = { key: string; label: string; entries: Entry[] }

/**
 * Collapses a both-dogs batch into one row, then files rows under their day.
 *
 * Oldest first, and the day headings with them, so the list reads the way the
 * day happened and the newest entry is the one nearest the deck. Sorts rather
 * than trusting the caller: sync happens to hand these over newest first, and a
 * list that renders out of order when it is not is a trap.
 */
function byDay(events: PupEvent[]): Day[] {
  const days: Day[] = []
  const dayAt = new Map<string, number>()
  const entryAt = new Map<string, number>()

  const oldestFirst = events
    .filter(isLive)
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))

  for (const event of oldestFirst) {

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
  const anyGlyph = days.some((day) =>
    day.entries.some((entry) =>
      entry.events.some((event) => event.type === 'potty' || isMark(event.type)),
    ),
  )
  // A note needs a column to sit in, and the same rule applies: reserve it on
  // every row as soon as anything on screen has one, and on none when nothing
  // does — otherwise the marks centre against a different right edge per row.
  const anyNote = days.some((day) =>
    day.entries.some((entry) => entry.events.some((event) => event.note)),
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
              const potty = group.find((event) => event.type === 'potty')
              const marked = markTypes.filter((type) =>
                group.some((event) => event.type === type),
              )
              const lead = potty ?? group[0]!
              // One column for what happened, however much of it happened. Two
              // glyphs side by side would put a bark a column further right than
              // a pee, and `both` is already a pair in one glyph.
              const marks =
                (potty ? POTTY_GLYPHS[potty.pottyKind] : '') +
                marked.map((type) => MARKS[type].glyph).join('')
              const marksLabel = [
                potty ? POTTY_LABELS[potty.pottyKind] : '',
                ...marked.map((type) => MARKS[type].label),
              ]
                .filter(Boolean)
                .join(' and ')
              const accident = isAccident(lead)
              const beingEdited = Boolean(
                editing?.some((event) => group.some((member) => member.id === event.id)),
              )
              // Ordered by the dog list, not by event order — so a pair always
              // reads the same way round, and the same way as the deck.
              const who = dogs.filter((dog) => group.some((event) => event.dogId === dog.id))
              const label = `${who.map((dog) => dog.name).join(' and ')}: ${describe(lead)}`
              const place = placeOf(lead)

              return (
                <li key={key} className="relative">
                  {accident ? (
                    <span
                      className="absolute -left-[1.1875rem] top-4 size-1.5 rounded-full bg-clay"
                      title="Accident"
                      aria-hidden
                    />
                  ) : null}

                  {/* The row is the control. Tapping it hands the entry to the
                      deck, which is where every field of it can be changed —
                      including the two things a pencil and a cross could not,
                      the dogs it covers and when it happened. The highlight runs
                      wider than the content so the hit area reads as a row. */}
                  <button
                    type="button"
                    onClick={() => onEdit?.(group)}
                    aria-label={`Edit: ${label}`}
                    // A button is shrink-to-fit even as a flex container, so the
                    // width is spelled out: the row plus the 12px it reaches out
                    // on either side.
                    className={`-mx-3 flex w-[calc(100%+1.5rem)] items-baseline gap-2 rounded-[0.5rem] px-3 py-2 text-left transition-colors hover:bg-surface ${
                      beingEdited ? 'bg-surface ring-1 ring-line' : ''
                    }`}
                  >
                    <time
                      className="w-[4.5rem] shrink-0 whitespace-nowrap text-sm text-ink-faint"
                      dateTime={lead.occurredAt}
                    >
                      {clockLabel(lead.occurredAt)}
                    </time>
                    <span
                      className="flex w-[3.1875rem] shrink-0 items-center gap-2 leading-none"
                      role="img"
                      aria-label={who.map((dog) => dog.name).join(' and ')}
                    >
                      {who.map((dog) => (
                        <Glyph
                          key={dog.id}
                          text={dog.emoji}
                          label={dog.name}
                          size={DOG_GLYPH_PX}
                        />
                      ))}
                    </span>

                    <span
                      // Air on both sides in one declaration, so the two can never
                      // drift apart the way a dog-column width and a control
                      // margin would. Set to match the gap the time leaves before
                      // the dogs.
                      className={`mx-3 flex min-w-0 items-center gap-1.5 text-sm text-ink ${
                        anyGlyph || anyNote ? 'flex-1' : ''
                      }`}
                    >
                      {/* The place holds its column, so a glance down the list
                          answers where they were without reading a single row. */}
                      {place ? <PlaceGlyph location={place} /> : null}
                      {/* What happened sits in the middle of whatever is left
                          between the place and the note. Always rendered, empty
                          or not: it is what pushes the note to the far end, and
                          an auto margin there would swallow the space this needs
                          to centre in. */}
                      <span className="flex flex-1 items-center justify-center gap-1.5">
                        {marks ? <Glyph text={marks} label={marksLabel} /> : null}
                      </span>
                      {!place ? (
                        <span className="truncate">{describe(lead)}</span>
                      ) : null}
                      {/* A column, not a trailing label: rendered on every row
                          once anything on screen has a note, empty or not.
                          Collapsing it where there is no note left the marks
                          centring against the row's edge on those rows and
                          against the note on the others, 84px apart. */}
                      {anyNote ? (
                        <span className="w-18 shrink-0 truncate pl-3 text-xs text-ink-muted">
                          {lead.note}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </section>
  )
}
