import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
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
import { PlaceGlyph } from './Place'

/** Sentinel selection: apply the entry to every dog at once. */
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
  // Closed, this deck is three buttons: move them, for both dogs, right now.
  // Open, it becomes a form and nothing is written until Log it.
  const [open, setOpen] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<Location | null>(null)
  const [pottyKind, setPottyKind] = useState<PottyKind | null>(null)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)

  const everyone = selectedId === BOTH && dogs.length > 1
  const chosen = everyone ? dogs : dogs.filter((dog) => dog.id === selectedId)
  const targets = chosen.length ? chosen : dogs.slice(0, 1)
  if (!targets.length) return null

  const where = (dog: Dog) => currentLocation(events, dog.id) ?? DEFAULT_LOCATION

  // Only a single place when they are actually together; apart, nothing is lit.
  const places = dogs.map(where)
  const shared = places.every((place) => place === places[0]) ? places[0]! : null
  const lit = open ? (pendingLocation ?? shared) : shared

  const accents = dogs.map((dog) => accentColor(dog.accent))
  const spread = `linear-gradient(135deg, ${accents.join(', ')})`
  const fill = open && !everyone ? accentColor(targets[0]!.accent) : spread

  // The place buttons hold emoji, not text, so their background carries no
  // contrast requirement and can be softened. Everything else here is a label
  // on a solid, and stays full strength.
  const soften = (colour: string) => `color-mix(in oklab, ${colour} 50%, white)`
  const placeFill =
    open && !everyone
      ? soften(accentColor(targets[0]!.accent))
      : `linear-gradient(135deg, ${accents.map(soften).join(', ')})`

  function reset() {
    setPendingLocation(null)
    setPottyKind(null)
    setNote('')
    setNoteOpen(false)
    setOpen(false)
  }

  function announce(message: string, ids: string[]) {
    toast(message, {
      action: { label: 'Undo', onClick: () => ids.forEach((id) => void undo(id)) },
    })
  }

  async function moveTo(next: Location, who: Dog[], text: string | null) {
    const moving = who.filter((dog) => where(dog) !== next)
    if (!moving.length) return []
    const occurredAt = new Date().toISOString()
    const created = await Promise.all(
      moving.map((dog) =>
        log({ type: 'location', dogId: dog.id, occurredAt, location: next, note: text }),
      ),
    )
    return created.map((event) => ({ id: event.id, name: dog_name(event.dogId) }))
  }

  function dog_name(id: string): string {
    return dogs.find((dog) => dog.id === id)?.name ?? ''
  }

  /** Closed: a tap is the whole entry, and it applies to every dog. */
  async function tapLocation(next: Location) {
    if (open) {
      setPendingLocation(next)
      return
    }
    tapped()
    const moved = await moveTo(next, dogs, null)
    if (!moved.length) return
    announce(
      `${moved.map((entry) => entry.name).join(' and ')} · ${LOCATION_LABELS[next]}`,
      moved.map((entry) => entry.id),
    )
  }

  const locationChanges = pendingLocation
    ? targets.some((dog) => where(dog) !== pendingLocation)
    : false
  const canSubmit = Boolean(pottyKind) || locationChanges

  async function submit() {
    if (!canSubmit) return
    tapped()

    const text = note.trim() || null
    const ids: string[] = []
    const occurredAt = new Date().toISOString()

    if (pottyKind) {
      const created = await Promise.all(
        targets.map((dog) =>
          log({
            type: 'potty',
            dogId: dog.id,
            occurredAt,
            location: pendingLocation ?? where(dog),
            pottyKind,
            note: text,
          }),
        ),
      )
      ids.push(...created.map((event) => event.id))
    }

    if (pendingLocation) {
      const moved = await moveTo(pendingLocation, targets, pottyKind ? null : text)
      ids.push(...moved.map((entry) => entry.id))
    }

    const place = pendingLocation ?? shared
    const summary = pottyKind
      ? `${POTTY_PAST[pottyKind]}${place ? ` ${PLACE_PAST[place]}` : ''}`
      : LOCATION_LABELS[pendingLocation!]
    announce(`${listNames(targets)} · ${summary}`, ids)
    reset()
  }

  const choices = [
    ...dogs.map((dog) => ({ id: dog.id, label: dog.name, fill: accentColor(dog.accent) })),
    ...(dogs.length > 1 ? [{ id: BOTH, label: 'Both', fill: spread }] : []),
  ]

  return (
    // Full-bleed background and gradient rule; the controls stay on the same
    // column grid as the timeline above.
    <div
      className="sticky bottom-0 z-10 border-t bg-surface shadow-[0_-12px_32px_-24px_rgba(0,0,0,0.45)]"
      style={{ borderTopWidth: 3, borderImage: `${spread} 1` }}
    >
      <div className="mx-auto w-full max-w-sm px-4 pb-5 pt-3">
      <div
        className="grid grid-cols-3 gap-2"
        role={open ? 'radiogroup' : undefined}
        aria-label={open ? 'Where' : undefined}
      >
        {LOCATIONS.map((option) => {
          const on = option === lit
          return (
            <button
              key={option}
              type="button"
              role={open ? 'radio' : undefined}
              aria-checked={open ? on : undefined}
              aria-label={LOCATION_LABELS[option]}
              title={LOCATION_LABELS[option]}
              onClick={() => void tapLocation(option)}
              className="press grid h-16 place-items-center rounded-2xl border"
              style={{
                borderColor: on ? 'transparent' : 'var(--color-line)',
                background: on ? placeFill : 'transparent',
              }}
            >
              <PlaceGlyph location={option} size={26} />
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => (open ? reset() : setOpen(true))}
        aria-expanded={open}
        className="press mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-2xl text-sm text-ink-faint hover:bg-sunk hover:text-ink"
      >
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        {open ? 'Less' : 'Add details'}
      </button>

      {open ? (
        <div className="mt-1 grid gap-2">
          {choices.length > 1 ? (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
              role="radiogroup"
              aria-label="Which dog"
            >
              {choices.map((choice) => {
                const on = choice.id === selectedId
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
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

          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What happened">
            {POTTY_KINDS.map((kind) => {
              const on = kind === pottyKind
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  // Exclusive: picking one clears the other two.
                  onClick={() => setPottyKind(on ? null : kind)}
                  className="press h-12 rounded-2xl border text-base font-bold"
                  style={{
                    borderColor: on ? 'transparent' : 'var(--color-line)',
                    background: on ? fill : 'transparent',
                    color: on ? 'var(--color-on-accent)' : 'var(--color-ink-muted)',
                  }}
                >
                  {POTTY_LABELS[kind]}
                </button>
              )
            })}
          </div>

          {noteOpen ? (
            <textarea
              autoFocus
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Soft stool, ate something in the yard…"
              aria-label="Note for this entry"
              className="w-full resize-none rounded-2xl border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus-visible:border-ink"
            />
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="press flex h-9 w-full items-center justify-center gap-1.5 rounded-2xl text-sm text-ink-faint hover:bg-sunk hover:text-ink"
            >
              <Plus size={14} />
              Add a note
            </button>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="press h-14 rounded-2xl text-lg font-bold disabled:opacity-40"
            style={{ background: fill, color: 'var(--color-on-accent)' }}
          >
            Log it
          </button>
        </div>
      ) : null}
      </div>
    </div>
  )
}
