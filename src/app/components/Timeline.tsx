import { useState } from 'react'
import { X } from 'lucide-react'
import {
  LOCATION_LABELS,
  POTTY_LABELS,
  isAccident,
  isLive,
  type Dog,
  type Location,
  type PupEvent,
} from '@/lib/domain'
import { annotate, undo } from '../lib/sync'
import { clockLabel, isSameDay, startOfToday } from '../lib/time'
import { LOCATION_ICONS } from './Deck'

const MOVED = { pen: 'Moved to the pen', outside: 'Moved outside', inside: 'Moved inside' } as const
const AT = { pen: 'in the pen', outside: 'outside', inside: 'inside' } as const

/**
 * Entries logged together share a timestamp and every other field, so they
 * collapse into one row carrying both dogs rather than two near-identical lines.
 */
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

/**
 * A bare stroke icon beside full-colour emoji reads as a stray glyph — the two
 * are different visual weights. The chip gives it a body so it lands as a
 * deliberate badge, and the colour carries meaning: outside is the goal, the
 * indoor places stay neutral.
 */
function Place({ location }: { location: Location }) {
  const Icon = LOCATION_ICONS[location]
  const outside = location === 'outside'
  return (
    <span
      className="inline-grid size-6 shrink-0 place-items-center rounded-lg"
      style={{
        background: outside ? 'var(--color-moss-soft)' : 'var(--color-sunk)',
        color: outside ? 'var(--color-moss)' : 'var(--color-ink-muted)',
      }}
      title={LOCATION_LABELS[location]}
      aria-hidden
    >
      <Icon size={14} strokeWidth={2.2} />
    </span>
  )
}

export function Timeline({ dogs, events }: { dogs: Dog[]; events: PupEvent[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const today = startOfToday()
  const byId = new Map(dogs.map((dog) => [dog.id, dog]))

  const grouped: { key: string; events: PupEvent[] }[] = []
  const index = new Map<string, number>()
  for (const event of events) {
    if (!isLive(event) || !isSameDay(event.occurredAt, today)) continue
    const key = signature(event)
    const at = index.get(key)
    if (at === undefined) {
      index.set(key, grouped.length)
      grouped.push({ key, events: [event] })
    } else {
      grouped[at]!.events.push(event)
    }
  }

  function open(key: string, note: string | null) {
    setEditing(key)
    setDraft(note ?? '')
  }

  async function commit(group: PupEvent[]) {
    setEditing(null)
    const note = draft.trim() || null
    await Promise.all(group.map((event) => annotate(event.id, note)))
  }

  return (
    <section className="mt-7">
      <h2 className="text-sm font-semibold text-ink-muted">Today</h2>

      {grouped.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
          Nothing logged yet today. Use the buttons below the moment it happens.
        </p>
      ) : (
        <ol className="mt-2 border-l border-line pl-4">
          {grouped.map(({ key, events: group }) => {
            const first = group[0]!
            const accident = isAccident(first)
            const who = group.map((event) => byId.get(event.dogId)).filter(Boolean) as Dog[]
            const label = `${who.map((dog) => dog.name).join(' and ')}: ${describe(first)}`
            const place =
              first.type === 'location' || first.type === 'potty' ? first.location : null

            return (
              <li key={key} className="py-2">
                <div className="flex items-baseline gap-3">
                  <time
                    className="w-16 shrink-0 text-sm text-ink-faint"
                    dateTime={first.occurredAt}
                  >
                    {clockLabel(first.occurredAt)}
                  </time>
                  <span
                    className="shrink-0 text-lg leading-none"
                    role="img"
                    aria-label={who.map((dog) => dog.name).join(' and ')}
                  >
                    {who.map((dog) => dog.emoji).join('')}
                  </span>
                  <button
                    type="button"
                    onClick={() => open(key, first.note)}
                    aria-label={`${first.note ? 'Edit' : 'Add'} note for ${label}`}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm ${
                      accident ? 'text-clay' : 'text-ink'
                    }`}
                  >
                    {place ? <Place location={place} /> : null}
                    {first.type === 'potty' ? (
                      <span className="truncate font-medium">{POTTY_LABELS[first.pottyKind]}</span>
                    ) : first.type !== 'location' ? (
                      <span className="truncate">{describe(first)}</span>
                    ) : null}
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
                    className="mt-1.5 ml-[4.75rem] w-[calc(100%-4.75rem)] resize-none rounded-xl border border-line bg-surface px-2 py-1.5 text-sm outline-none placeholder:text-ink-faint focus-visible:border-ink"
                  />
                ) : first.note ? (
                  <p className="ml-[4.75rem] mt-0.5 text-xs leading-snug text-ink-muted">
                    {first.note}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
