import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import {
  DEFAULT_LOCATION,
  LOCATIONS,
  LOCATION_LABELS,
  POTTY_GLYPHS,
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
import { Glyph, PlaceGlyph } from './Place'

type Props = {
  dogs: Dog[]
  events: PupEvent[]
}

/** Pee and poo are picked independently; picking both is the `both` kind. */
const PICKS = ['pee', 'poo'] as const
type PottyPick = (typeof PICKS)[number]

/** No paper plane exists in the emoji set; the outbox tray is the send glyph. */
const SEND = '📤'

/** The places, and the detail row beneath them at half the height and half the glyph. */
const MAIN_GLYPH_PX = 24
const DETAIL_GLYPH_PX = MAIN_GLYPH_PX / 2

const POTTY_PAST = { pee: 'Peed', poo: 'Pooed', both: 'Peed and pooed' } as const
const PLACE_PAST = {
  pen: 'in the pen',
  outside: 'outside',
  inside: 'inside',
  crate: 'in the crate',
  bed: 'in our bed',
} as const

function listNames(dogs: Dog[]): string {
  if (dogs.length <= 1) return dogs[0]?.name ?? ''
  return `${dogs.slice(0, -1).map((dog) => dog.name).join(', ')} and ${dogs.at(-1)!.name}`
}

/** The deck's one button shape: a bordered tile that fills in when it is on. */
function tile(on: boolean, fill: string) {
  return {
    borderColor: on ? 'transparent' : 'var(--color-line)',
    background: on ? fill : 'transparent',
  }
}

export function Deck({ dogs, events }: Props) {
  // Closed, this deck is five place buttons: move them, for both dogs, right now.
  // Open, it becomes a form and nothing is written until the send button.
  const [open, setOpen] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<Location | null>(null)
  const [picks, setPicks] = useState<PottyPick[]>([])
  const [note, setNote] = useState('')
  // Held as the dogs left out rather than the ones taken, so every dog — including
  // one that only syncs down later — starts an entry selected.
  const [skipped, setSkipped] = useState<string[]>([])

  if (!dogs.length) return null

  const targets = dogs.filter((dog) => !skipped.includes(dog.id))
  const pottyKind: PottyKind | null = picks.length === 2 ? 'both' : (picks[0] ?? null)

  const where = (dog: Dog) => currentLocation(events, dog.id) ?? DEFAULT_LOCATION

  // Only a single place when they are actually together; apart, nothing is lit.
  const places = dogs.map(where)
  const shared = places.every((place) => place === places[0]) ? places[0]! : null
  const lit = open ? (pendingLocation ?? shared) : shared

  const accents = dogs.map((dog) => accentColor(dog.accent))
  const spread = `linear-gradient(135deg, ${accents.join(', ')})`

  // These buttons hold emoji, not text, so their background carries no contrast
  // requirement and can be softened.
  const soften = (colour: string) => `color-mix(in oklab, ${colour} 50%, white)`
  const blend = (list: Dog[]) =>
    list.length > 1
      ? `linear-gradient(135deg, ${list.map((dog) => soften(accentColor(dog.accent))).join(', ')})`
      : soften(accentColor(list[0]!.accent))
  const fill = blend(open && targets.length ? targets : dogs)

  function reset() {
    setPendingLocation(null)
    setPicks([])
    setNote('')
    setSkipped([])
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

  function togglePick(pick: PottyPick) {
    setPicks((current) =>
      current.includes(pick) ? current.filter((other) => other !== pick) : [...current, pick],
    )
  }

  function toggleDog(id: string) {
    setSkipped((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    )
  }

  const locationChanges = pendingLocation
    ? targets.some((dog) => where(dog) !== pendingLocation)
    : false
  const canSubmit = targets.length > 0 && (Boolean(pottyKind) || locationChanges)

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

  return (
    // Full-bleed background and gradient rule; the controls stay on the same
    // column grid as the timeline above.
    <div
      className="sticky bottom-0 z-10 border-t bg-surface shadow-[0_-12px_32px_-24px_rgba(0,0,0,0.45)]"
      style={{ borderTopWidth: 3, borderImage: `${spread} 1` }}
    >
      <div className="mx-auto w-full max-w-sm px-4 pb-5 pt-3">
        <div
          // Five places across: at 375px that is ~62px each, comfortably past the
          // 44px a thumb needs.
          className="grid grid-cols-5 gap-1.5"
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
                onClick={() => void tapLocation(option)}
                className="press grid h-16 place-items-center rounded-2xl border"
                style={tile(on, fill)}
              >
                <PlaceGlyph location={option} size={MAIN_GLYPH_PX} />
              </button>
            )
          })}
        </div>

        {/* The eye is the only thing on this line until it is opened, and it holds
            its place at the right edge while the form fills in to its left. */}
        <div className="mt-1.5 flex items-center justify-end gap-2">
          {open ? (
            <>
              <div className="flex gap-1" role="group" aria-label="Which dog">
                {dogs.map((dog) => {
                  const on = !skipped.includes(dog.id)
                  return (
                    <button
                      key={dog.id}
                      type="button"
                      aria-pressed={on}
                      aria-label={dog.name}
                      onClick={() => toggleDog(dog.id)}
                      className="press grid size-8 place-items-center rounded-2xl border"
                      style={tile(on, soften(accentColor(dog.accent)))}
                    >
                      <Glyph text={dog.emoji} label={dog.name} size={DETAIL_GLYPH_PX} />
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-1" role="group" aria-label="What happened">
                {PICKS.map((pick) => {
                  const on = picks.includes(pick)
                  return (
                    <button
                      key={pick}
                      type="button"
                      aria-pressed={on}
                      aria-label={POTTY_LABELS[pick]}
                      onClick={() => togglePick(pick)}
                      className="press grid size-8 place-items-center rounded-2xl border"
                      style={tile(on, fill)}
                    >
                      <Glyph
                        text={POTTY_GLYPHS[pick]}
                        label={POTTY_LABELS[pick]}
                        size={DETAIL_GLYPH_PX}
                      />
                    </button>
                  )
                })}
              </div>

              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                aria-label="Note for this entry"
                className="h-8 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus-visible:border-ink"
              />

              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                aria-label="Log it"
                className="press grid size-8 place-items-center rounded-2xl border disabled:opacity-40"
                style={tile(canSubmit, fill)}
              >
                <Glyph text={SEND} label="Log it" size={DETAIL_GLYPH_PX} />
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => (open ? reset() : setOpen(true))}
            aria-expanded={open}
            aria-label={open ? 'Hide details' : 'Add details'}
            // No padding on the right, so the icon ends on the same line as the
            // last place button above it.
            className="press grid h-8 place-items-center pl-2 text-ink-faint hover:text-ink"
          >
            {open ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
