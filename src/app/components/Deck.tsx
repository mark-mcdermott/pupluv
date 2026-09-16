import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
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

/** Sentinel selection: log the same thing for every dog at once. */
export const BOTH = 'both'

type Props = {
  dogs: Dog[]
  events: PupEvent[]
  selectedId: string
  onSelect: (id: string) => void
}

const POTTY_PAST = { pee: 'Peed', poo: 'Pooed', both: 'Peed and pooed' } as const
const PLACE_PAST = { pen: 'in the pen', outside: 'outside', inside: 'inside' } as const

function listNames(dogs: Dog[]): string {
  if (dogs.length <= 1) return dogs[0]?.name ?? ''
  return `${dogs.slice(0, -1).map((dog) => dog.name).join(', ')} and ${dogs.at(-1)!.name}`
}

export function Deck({ dogs, events, selectedId, onSelect }: Props) {
  // A note is optional and rare, so it stays collapsed: the three taps that
  // matter must never be pushed off the thumb by a textarea nobody is using.
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)

  const everyone = selectedId === BOTH && dogs.length > 1
  const targets = everyone ? dogs : dogs.filter((dog) => dog.id === selectedId)
  const active = targets.length ? targets : dogs.slice(0, 1)
  if (!active.length) return null

  const where = (dog: Dog) => currentLocation(events, dog.id) ?? DEFAULT_LOCATION

  // With one dog this is simply where it is. With both, it is only a single
  // place when they are actually in the same place — otherwise no segment is
  // lit, which is the honest way to say "they are apart right now".
  const places = active.map(where)
  const shared = places.every((place) => place === places[0]) ? places[0]! : null

  const accents = dogs.map((dog) => accentColor(dog.accent))
  const spread = `linear-gradient(135deg, ${accents.join(', ')})`
  const fill = everyone ? spread : accentColor(active[0]!.accent)

  function takeNote(): string | null {
    return note.trim() || null
  }

  function clearNote() {
    setNote('')
    setNoteOpen(false)
  }

  function announce(message: string, ids: string[]) {
    toast(message, {
      action: { label: 'Undo', onClick: () => ids.forEach((id) => void undo(id)) },
    })
  }

  async function logPotty(pottyKind: PottyKind) {
    tapped()
    // One timestamp for the batch so the entries line up in the timeline.
    const occurredAt = new Date().toISOString()
    const created = await Promise.all(
      active.map((dog) =>
        log({
          type: 'potty',
          dogId: dog.id,
          occurredAt,
          location: where(dog),
          pottyKind,
          note: takeNote(),
        }),
      ),
    )
    clearNote()
    const place = shared ? ` ${PLACE_PAST[shared]}` : ''
    announce(
      `${listNames(active)} · ${POTTY_PAST[pottyKind]}${place}`,
      created.map((event) => event.id),
    )
  }

  async function move(next: Location) {
    const moving = active.filter((dog) => where(dog) !== next)
    if (!moving.length) return

    tapped()
    const occurredAt = new Date().toISOString()
    const created = await Promise.all(
      moving.map((dog) =>
        log({ type: 'location', dogId: dog.id, occurredAt, location: next, note: takeNote() }),
      ),
    )
    clearNote()
    announce(
      `${listNames(moving)} · ${LOCATION_LABELS[next]}`,
      created.map((event) => event.id),
    )
  }

  const choices = [
    ...dogs.map((dog) => ({ id: dog.id, label: dog.name, fill: accentColor(dog.accent) })),
    ...(dogs.length > 1 ? [{ id: BOTH, label: 'Both', fill: spread }] : []),
  ]

  return (
    <div
      className="sticky bottom-0 z-10 rounded-t-deck border-t bg-surface px-4 pb-5 pt-3 shadow-[0_-12px_32px_-24px_rgba(0,0,0,0.45)]"
      style={
        everyone
          ? { borderTopWidth: 3, borderImage: `${spread} 1` }
          : { borderTopWidth: 3, borderTopColor: fill }
      }
    >
      {choices.length > 1 ? (
        <div
          className="mb-3 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
          role="tablist"
          aria-label="Which dog"
        >
          {choices.map((choice) => {
            const on = choice.id === selectedId
            return (
              <button
                key={choice.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onSelect(choice.id)}
                className="press h-11 truncate rounded-2xl border px-2 text-base font-semibold"
                style={{
                  borderColor: on ? 'transparent' : 'var(--color-line)',
                  background: on ? choice.fill : 'transparent',
                  color: on ? 'var(--color-on-accent)' : 'var(--color-ink-muted)',
                }}
              >
                {choice.label}
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
            style={{ background: fill, color: 'var(--color-on-accent)' }}
          >
            {POTTY_LABELS[kind]}
          </button>
        ))}
      </div>

      <div
        className="mt-2 grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-label={`Where ${listNames(active)} ${active.length > 1 ? 'are' : 'is'}`}
      >
        {LOCATIONS.map((option) => {
          const on = option === shared
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => void move(option)}
              className={`press h-11 rounded-2xl border text-sm font-semibold ${
                on
                  ? 'border-ink bg-ink text-ground'
                  : 'border-line text-ink-muted hover:border-ink-faint hover:text-ink'
              }`}
            >
              {LOCATION_LABELS[option]}
            </button>
          )
        })}
      </div>

      {noteOpen ? (
        <div className="mt-2">
          <textarea
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && clearNote()}
            rows={2}
            maxLength={500}
            placeholder="Soft stool, ate something in the yard…"
            aria-label="Note for the next entry"
            className="w-full resize-none rounded-2xl border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus-visible:border-ink"
          />
          <p className="px-1 pt-1 text-xs text-ink-faint">
            Goes on the next thing you log{everyone ? ', for both dogs' : ''}.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="press mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-2xl text-sm text-ink-faint hover:bg-sunk hover:text-ink"
        >
          <Plus size={14} />
          Add a note
        </button>
      )}
    </div>
  )
}
