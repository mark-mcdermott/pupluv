import { X } from 'lucide-react'
import { isAccident, isLive, type Dog, type PupEvent } from '@/lib/domain'
import { accentColor } from '../lib/accent'
import { undo } from '../lib/sync'
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
  const today = startOfToday()
  const todays = events.filter((event) => isLive(event) && isSameDay(event.occurredAt, today))
  const byId = new Map(dogs.map((dog) => [dog.id, dog]))

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
              <li key={event.id} className="flex items-baseline gap-3 py-2">
                <time className="w-16 shrink-0 text-sm text-ink-faint" dateTime={event.occurredAt}>
                  {clockLabel(event.occurredAt)}
                </time>
                <span
                  className="w-20 shrink-0 truncate text-sm font-semibold"
                  style={{ color: accentColor(dog?.accent ?? '') }}
                >
                  {dog?.name ?? 'Unknown'}
                </span>
                <span className={`flex-1 text-sm ${accident ? 'text-clay' : 'text-ink'}`}>
                  {describe(event)}
                </span>
                <button
                  type="button"
                  onClick={() => void undo(event.id)}
                  aria-label={`Remove: ${describe(event)}`}
                  title="Remove"
                  className="press grid size-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunk hover:text-ink"
                >
                  <X size={14} />
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
