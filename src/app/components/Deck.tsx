import { useEffect, useState, type CSSProperties } from 'react'
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
import { fromLocalInput, toLocalInput } from '../lib/time'
import { Glyph, PlaceGlyph } from './Place'

type Props = {
  dogs: Dog[]
  events: PupEvent[]
  /** The entry the pencil opened, which this deck becomes the editor for. */
  editing?: PupEvent[] | null
  onDone?: () => void
}

/** Pee and poo are picked independently; picking both is the `both` kind. */
const PICKS = ['pee', 'poo'] as const
type PottyPick = (typeof PICKS)[number]

/** No paper plane exists in the emoji set; the outbox tray is the send glyph. */
const SEND = '📤'

/** One fill for every button in the detail row — see --color-tile. */
const TILE_FILL = 'var(--color-tile)'

/** A trace of a colour: enough to preview a fill without standing in for it. */
const trace = (colour: string) => `color-mix(in oklab, ${colour} 16%, transparent)`

/** The places, and the detail row beneath them at three quarters the size. */
const MAIN_GLYPH_PX = 24
const DETAIL_GLYPH_PX = Math.round(MAIN_GLYPH_PX * 0.75)

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

/**
 * The deck's one button shape: a bordered tile that fills in when it is on, and
 * shows a trace of the deck's gradient on hover when it is not. Both fills are
 * handed to CSS as properties; `.deck-tile` decides which of them applies.
 */
function tile(on: boolean, fill: string, hint: string): CSSProperties {
  return {
    borderColor: on ? 'transparent' : 'var(--color-line)',
    '--fill': fill,
    '--hint': hint,
  } as CSSProperties
}

export function Deck({ dogs, events, editing = null, onDone }: Props) {
  // Closed, this deck is five place buttons: move them, for both dogs, right now.
  // Open, it becomes a form and nothing is written until the send button.
  const [open, setOpen] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<Location | null>(null)
  const [picks, setPicks] = useState<PottyPick[]>([])
  const [note, setNote] = useState('')
  // Held as the dogs left out rather than the ones taken, so every dog — including
  // one that only syncs down later — starts an entry selected.
  const [skipped, setSkipped] = useState<string[]>([])
  /** Only an edit shows a time, and only an edit can change one. */
  const [at, setAt] = useState('')

  // The pencil hands the entry over; the deck takes its shape on so the buttons
  // read as what was logged rather than as a fresh entry.
  useEffect(() => {
    if (!editing?.length) return
    const lead = editing.find((event) => event.type === 'potty') ?? editing[0]!
    setOpen(true)
    setSkipped(
      dogs.filter((dog) => !editing.some((event) => event.dogId === dog.id)).map((dog) => dog.id),
    )
    setPicks(
      lead.type === 'potty'
        ? lead.pottyKind === 'both'
          ? [...PICKS]
          : [lead.pottyKind]
        : [],
    )
    setPendingLocation(lead.type === 'potty' || lead.type === 'location' ? lead.location : null)
    setNote(lead.note ?? '')
    setAt(toLocalInput(lead.occurredAt))
    // Only the entry, deliberately. Every sync hands down a fresh dogs array,
    // and listing it here would reset a half-finished edit once a minute.
  }, [editing])

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

  // The places hold emoji, not text, so their background carries no contrast
  // requirement and can be softened. The detail row cannot: at a quarter the
  // area, behind glyphs that are half white, it takes one deep fill instead —
  // and one for every button, so that being on looks the same everywhere in the
  // row.
  const soften = (colour: string) => `color-mix(in oklab, ${colour} 50%, white)`
  const across = (colours: string[]) =>
    colours.length > 1 ? `linear-gradient(135deg, ${colours.join(', ')})` : colours[0]!

  const chosen = open && targets.length ? targets : dogs
  const softened = chosen.map((dog) => soften(accentColor(dog.accent)))
  const fill = across(softened)
  // One hover trace for the whole deck, taken from the places' gradient — a
  // trace of the detail row's own deep fill would barely show.
  const hint = across(softened.map(trace))

  function reset() {
    setPendingLocation(null)
    setPicks([])
    setNote('')
    setSkipped([])
    setAt('')
    setOpen(false)
    onDone?.()
  }

  function announce(message: string, ids: string[]) {
    toast(message, {
      action: { label: 'Undo', onClick: () => ids.forEach((id) => void undo(id)) },
    })
  }

  /**
   * The instant is passed in rather than minted here: a move logged alongside a
   * potty is one entry, and two timestamps milliseconds apart split it in two on
   * the timeline.
   */
  async function moveTo(
    next: Location,
    who: Dog[],
    text: string | null,
    occurredAt: string,
  ) {
    const moving = who.filter((dog) => where(dog) !== next)
    if (!moving.length) return []
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
    const moved = await moveTo(next, dogs, null, new Date().toISOString())
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

  /**
   * An edit is a replacement: what was logged is tombstoned and what is on
   * screen is written in its place. Everything but the note is immutable once
   * logged, and replacing keeps that true while still letting a row be
   * corrected — including which dogs it covers, which no update to a single row
   * could change.
   */
  async function submitEdit() {
    if (!editing?.length || !targets.length) return
    tapped()

    const lead = editing.find((event) => event.type === 'potty') ?? editing[0]!
    const place =
      pendingLocation ??
      (lead.type === 'potty' || lead.type === 'location' ? lead.location : DEFAULT_LOCATION)
    const occurredAt = fromLocalInput(at) ?? lead.occurredAt
    const text = note.trim() || null
    // An entry always has a place, so a row left with no potty on it is a move.
    const asMove = !pottyKind || editing.some((event) => event.type === 'location')

    await Promise.all(editing.map((event) => undo(event.id)))
    await Promise.all(
      targets.flatMap((dog) => {
        const writes = []
        if (pottyKind) {
          writes.push(
            log({
              type: 'potty',
              dogId: dog.id,
              occurredAt,
              location: place,
              pottyKind,
              note: text,
            }),
          )
        }
        if (asMove) {
          writes.push(
            log({
              type: 'location',
              dogId: dog.id,
              occurredAt,
              location: place,
              note: pottyKind ? null : text,
            }),
          )
        }
        return writes
      }),
    )

    toast(`Updated · ${listNames(targets)}`)
    reset()
  }

  const locationChanges = pendingLocation
    ? targets.some((dog) => where(dog) !== pendingLocation)
    : false
  const canSubmit = targets.length > 0 && (Boolean(pottyKind) || locationChanges)

  async function submit() {
    // Live whenever the row is open, so with nothing picked it is simply the way
    // back out.
    if (!canSubmit) {
      reset()
      return
    }
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
      const moved = await moveTo(pendingLocation, targets, pottyKind ? null : text, occurredAt)
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
      // A band of the layout now rather than something stuck over it: the
      // timeline above scrolls inside its own box, so there is nothing to stick
      // to and nothing to overlap.
      className="shrink-0 border-t bg-surface shadow-[0_-12px_32px_-24px_rgba(0,0,0,0.45)]"
      style={{ borderTopWidth: 3, borderImage: `${spread} 1` }}
    >
      {/* The home indicator sits over the last row otherwise. */}
      <div className="mx-auto w-full max-w-sm px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {editing ? (
          <input
            type="datetime-local"
            value={at}
            onChange={(event) => setAt(event.target.value)}
            aria-label="When this happened"
            className="mb-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus-visible:border-ink"
          />
        ) : null}

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
                data-on={on}
                className="press deck-tile grid h-16 place-items-center rounded-2xl border"
                style={tile(on, fill, hint)}
              >
                <PlaceGlyph location={option} size={MAIN_GLYPH_PX} />
              </button>
            )
          })}
        </div>

        {/* The eye is the only thing on this line until it is opened, and it holds
            its place at the right edge while the form fills in to its left. */}
        <div className="mt-1.5 flex items-center justify-end gap-3.5">
          {open ? (
            <>
              <div className="flex gap-1.5" role="group" aria-label="Which dog">
                {dogs.map((dog) => {
                  const on = !skipped.includes(dog.id)
                  return (
                    <button
                      key={dog.id}
                      type="button"
                      aria-pressed={on}
                      aria-label={dog.name}
                      onClick={() => toggleDog(dog.id)}
                      data-on={on}
                      className="press deck-tile grid size-12 shrink-0 place-items-center rounded-full border"
                      style={tile(on, TILE_FILL, hint)}
                    >
                      <Glyph text={dog.emoji} label={dog.name} size={DETAIL_GLYPH_PX} />
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-1.5" role="group" aria-label="What happened">
                {PICKS.map((pick) => {
                  const on = picks.includes(pick)
                  return (
                    <button
                      key={pick}
                      type="button"
                      aria-pressed={on}
                      aria-label={POTTY_LABELS[pick]}
                      onClick={() => togglePick(pick)}
                      data-on={on}
                      className="press deck-tile grid size-12 shrink-0 place-items-center rounded-full border"
                      style={tile(on, TILE_FILL, hint)}
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

              <span className="flex-1" />

              {editing ? null : (
                <button
                  type="button"
                  onClick={() => void submit()}
                  aria-label="Log it"
                  data-on={false}
                  className="press deck-tile fill-on-press grid size-12 shrink-0 place-items-center rounded-full border"
                  style={tile(false, TILE_FILL, hint)}
                >
                  <Glyph text={SEND} label="Log it" size={DETAIL_GLYPH_PX} />
                </button>
              )}
            </>
          ) : null}

          <button
            type="button"
            onClick={() => (open ? reset() : setOpen(true))}
            aria-expanded={open}
            aria-label={open ? 'Hide details' : 'Add details'}
            // No padding on the right, so the icon ends on the same line as the
            // last place button above it.
            className="press grid h-12 shrink-0 place-items-center pl-2 text-ink-faint hover:text-ink"
          >
            {open ? <EyeOff size={22} /> : <Eye size={22} />}
          </button>
        </div>

        {open ? (
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            aria-label="Note for this entry"
            className="mt-1.5 h-12 w-full rounded-2xl border border-line bg-surface px-4 text-sm outline-none focus-visible:border-ink"
          />
        ) : null}

        {editing ? (
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="press h-11 rounded-xl border border-line px-4 text-sm font-semibold text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitEdit()}
              disabled={!targets.length}
              // White rather than --color-on-accent: the tile fill is deep in
              // both themes, and that token flips to a dark ink in the dark one.
              className="press h-11 rounded-xl px-5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: TILE_FILL }}
            >
              Submit
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
