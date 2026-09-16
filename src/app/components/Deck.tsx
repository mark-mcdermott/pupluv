import { toast } from 'sonner'
import {
  DEFAULT_LOCATION,
  LOCATIONS,
  LOCATION_LABELS,
  POTTY_KINDS,
  POTTY_LABELS,
  currentLocation,
  type Dog,
  type Location,
  type PottyKind,
  type PupEvent,
} from '@/lib/domain'
import { accentColor } from '../lib/accent'
import { tapped } from '../lib/feedback'
import { log, undo } from '../lib/sync'

type Props = {
  dogs: Dog[]
  events: PupEvent[]
  selectedId: string
  onSelect: (id: string) => void
}

const POTTY_PAST = { pee: 'Peed', poo: 'Pooed', both: 'Peed and pooed' } as const
const MOVE_PAST = { pen: 'in the pen', outside: 'outside', inside: 'inside' } as const

export function Deck({ dogs, events, selectedId, onSelect }: Props) {
  const dog = dogs.find((candidate) => candidate.id === selectedId) ?? dogs[0]
  if (!dog) return null

  const accent = accentColor(dog.accent)
  // The deck always shows the location it is about to file the event under, so
  // a one-tap log is never a guess.
  const location = currentLocation(events, dog.id) ?? DEFAULT_LOCATION

  function announce(message: string, id: string) {
    toast(message, { action: { label: 'Undo', onClick: () => void undo(id) } })
  }

  async function logPotty(pottyKind: PottyKind) {
    tapped()
    const event = await log({
      type: 'potty',
      dogId: dog.id,
      occurredAt: new Date().toISOString(),
      location,
      pottyKind,
      note: null,
    })
    announce(`${dog.name} · ${POTTY_PAST[pottyKind]} ${MOVE_PAST[location]}`, event.id)
  }

  async function move(next: Location) {
    if (next === location) return
    tapped()
    const event = await log({
      type: 'location',
      dogId: dog.id,
      occurredAt: new Date().toISOString(),
      location: next,
      note: null,
    })
    announce(`${dog.name} · ${LOCATION_LABELS[next]}`, event.id)
  }

  return (
    <div
      className="sticky bottom-0 z-10 rounded-t-deck border-t bg-surface px-4 pb-5 pt-3 shadow-[0_-12px_32px_-24px_rgba(0,0,0,0.45)]"
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
    >
      {dogs.length > 1 ? (
        <div className="mb-3 grid grid-cols-2 gap-2" role="tablist" aria-label="Which dog">
          {dogs.map((candidate) => {
            const active = candidate.id === dog.id
            return (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(candidate.id)}
                className="press h-11 rounded-2xl border text-base font-semibold"
                style={{
                  borderColor: active ? accentColor(candidate.accent) : 'var(--color-line)',
                  background: active ? accentColor(candidate.accent) : 'transparent',
                  color: active ? 'var(--color-on-accent)' : 'var(--color-ink-muted)',
                }}
              >
                {candidate.name}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {POTTY_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => void logPotty(kind)}
            className="press h-16 rounded-2xl text-lg font-bold"
            style={{ background: accent, color: 'var(--color-on-accent)' }}
          >
            {POTTY_LABELS[kind]}
          </button>
        ))}
      </div>

      <div
        className="mt-2 grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-label={`Where ${dog.name} is`}
      >
        {LOCATIONS.map((option) => {
          const active = option === location
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => void move(option)}
              className={`press h-11 rounded-2xl border text-sm font-semibold ${
                active
                  ? 'border-ink bg-ink text-ground'
                  : 'border-line text-ink-muted hover:border-ink-faint hover:text-ink'
              }`}
            >
              {LOCATION_LABELS[option]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
