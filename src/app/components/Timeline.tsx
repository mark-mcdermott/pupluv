import { useState } from 'react'
import { X } from 'lucide-react'
import { isAccident, isLive, type Dog, type PupEvent } from '@/lib/domain'
import { accentColor } from '../lib/accent'
import { annotate, undo } from '../lib/sync'
import { clockLabel, isSameDay, startOfToday } from '../lib/time'

const POTTY_VERB = { pee: 'Peed', poo: 'Pooed', both: 'Peed and pooed' } as const
const POTTY_PLACE = { pen: 'in the pen', outside: 'outside', inside: 'inside' } as const
const MOVED = { pen: 'Into the pen', outside: 'Out to the yard', inside: 'Back inside' } as const

function describe(event: PupEvent): string {
  switch (event.type) {
    case 'potty':
      return `${POTTY_VERB[event.pottyKind]} ${POTTY_PLACE[event.location]}`
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

export function Timeline({ dogs, events }: { dogs: Dog[]; events: PupEvent[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const today = startOfToday()
  const todays = events.filter((event) => isLive(event) && isSameDay(event.occurredAt, today))
  const byId = new Map(dogs.map((dog) => [dog.id, dog]))

  function open(event: PupEvent) {
    setEditing(event.id)
    setDraft(event.note ?? '')
  }

  async function commit(event: PupEvent) {
    setEditing(null)
    await annotate(event.id, draft.trim() || null)
  }

  return (
    <section className="mt-7">
      <h2 className="text-sm font-semibold text-ink-muted">Today</h2>

      {todays.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
          Nothing logged yet today. Use the buttons below the moment it happens.
        </p>
      ) : (
        <ol className="mt-2 border-l border-line pl-4">
          {todays.map((event) => {
            const dog = byId.get(event.dogId)
            const accident = isAccident(event)
            return (
              <li key={event.id} className="py-2">
                <div className="flex items-baseline gap-3">
                  <time
                    className="w-16 shrink-0 text-sm text-ink-faint"
                    dateTime={event.occurredAt}
                  >
                    {clockLabel(event.occurredAt)}
                  </time>
                  <span
                    className="w-20 shrink-0 truncate text-sm font-semibold"
                    style={{ color: accentColor(dog?.accent ?? '') }}
                  >
                    {dog?.name ?? 'Unknown'}
                  </span>
                  <button
                    type="button"
                    onClick={() => open(event)}
                    aria-label={`${event.note ? 'Edit' : 'Add'} note for ${describe(event)}`}
                    className={`min-w-0 flex-1 text-left text-sm ${
                      accident ? 'text-clay' : 'text-ink'
                    }`}
                  >
                    {describe(event)}
                  </button>
                  <button
                    type="button"
                    onClick={() => void undo(event.id)}
                    aria-label={`Remove: ${describe(event)}`}
                    title="Remove"
                    className="press grid size-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunk hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* A note gets the full row width — squeezed into the description
                    column it wrapped after three or four words. */}
                {editing === event.id ? (
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(change) => setDraft(change.target.value)}
                    onBlur={() => void commit(event)}
                    onKeyDown={(key) => {
                      if (key.key === 'Escape') setEditing(null)
                    }}
                    rows={2}
                    maxLength={500}
                    placeholder="Add a note…"
                    aria-label={`Note for ${describe(event)}`}
                    className="mt-1.5 ml-[4.75rem] w-[calc(100%-4.75rem)] resize-none rounded-xl border border-line bg-surface px-2 py-1.5 text-sm outline-none placeholder:text-ink-faint focus-visible:border-ink"
                  />
                ) : event.note ? (
                  <p className="ml-[4.75rem] mt-0.5 text-xs leading-snug text-ink-muted">
                    {event.note}
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
