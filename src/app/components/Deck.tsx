import { useEffect, useState, type CSSProperties } from 'react'
import { toast } from 'sonner'
import {
  BARK_GLYPH,
  BARK_LABEL,
  MEAL_GLYPH,
  MEAL_LABEL,
  SLEEP_GLYPH,
  SLEEP_LABEL,
  DEFAULT_LOCATION,
  LOCATIONS,
  LOCATION_LABELS,
  NOTE_MAX,
  POTTY_GLYPHS,
  POTTY_LABELS,
  currentLocation,
  type Dog,
  type DraftEvent,
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

/** One fill for every button in the detail row — see --color-tile. */
const TILE_FILL = 'var(--color-tile)'

/** A trace of a colour: enough to preview a fill without standing in for it. */
const trace = (colour: string) => `color-mix(in oklab, ${colour} 16%, transparent)`

/** The places, and the detail row beneath them at three quarters the size. */
const MAIN_GLYPH_PX = 24
/**
 * Seven circles no longer fit at three quarters of a place tile. The gaps give
 * way before the circles do: 44px is the smallest a thumb should be asked for,
 * and group separation survives at a 3:1 ratio where a touch target does not.
 */
const DETAIL_GLYPH_PX = Math.round(MAIN_GLYPH_PX * 0.7)

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
  /** Its own event, not a kind of potty: never an accident, and about time and
   *  place rather than house-training. It sits with the picks because that is
   *  where "what happened" lives. */
  const [barked, setBarked] = useState(false)
  const [ate, setAte] = useState(false)
  const [slept, setSlept] = useState(false)
  const [note, setNote] = useState('')
  // Held as the dogs left out rather than the ones taken, so every dog — including
  // one that only syncs down later — starts an entry selected.
  const [skipped, setSkipped] = useState<string[]>([])
  /** The instant the entry will carry, editable whenever the row is open. */
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
    setBarked(editing.some((event) => event.type === 'bark'))
    setAte(editing.some((event) => event.type === 'meal'))
    setSlept(editing.some((event) => event.type === 'sleep'))
    setPicks(
      lead.type === 'potty'
        ? lead.pottyKind === 'both'
          ? [...PICKS]
          : [lead.pottyKind]
        : [],
    )
    setPendingLocation(
      lead.type === 'water' ? null : lead.location,
    )
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

  function openDetails() {
    setAt(toLocalInput(new Date().toISOString()))
    setOpen(true)
  }

  function reset() {
    setPendingLocation(null)
    setPicks([])
    setBarked(false)
    setAte(false)
    setSlept(false)
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
      (lead.type === 'water' ? DEFAULT_LOCATION : lead.location)
    const occurredAt = fromLocalInput(at) ?? lead.occurredAt
    const text = note.trim() || null
    const marked = marks()
    // An entry always has a place, so a row left with nothing on it is a move.
    const asMove = !marked.length || editing.some((event) => event.type === 'location')
    const writes = asMove
      ? [
          ...marked,
          (dogId: string, occurredAt: string, location: Location, note: string | null) =>
            ({ type: 'location', dogId, occurredAt, location, note }) as DraftEvent,
        ]
      : marked

    await Promise.all(editing.map((event) => undo(event.id)))
    await Promise.all(
      targets.flatMap((dog) =>
        writes.map((build, index) => log(build(dog.id, occurredAt, place, index ? null : text))),
      ),
    )

    toast(`Updated · ${listNames(targets)}`)
    reset()
  }

  async function remove() {
    if (!editing?.length) return
    tapped()
    await Promise.all(editing.map((event) => undo(event.id)))
    reset()
  }

  /**
   * What the row adds to an entry beyond the move itself, in the order it reads.
   * The note belongs to the entry rather than to any one event in it, so it
   * rides on the first written and the rest carry null — whatever is picked.
   */
  type Mark = (dogId: string, occurredAt: string, place: Location, note: string | null) => DraftEvent

  function marks(): Mark[] {
    const list: Mark[] = []
    if (pottyKind) {
      list.push((dogId, occurredAt, location, note) => ({
        type: 'potty',
        dogId,
        occurredAt,
        location,
        pottyKind,
        note,
      }))
    }
    if (barked) {
      list.push((dogId, occurredAt, location, note) => ({
        type: 'bark',
        dogId,
        occurredAt,
        location,
        note,
      }))
    }
    if (ate) {
      list.push((dogId, occurredAt, location, note) => ({
        type: 'meal',
        dogId,
        occurredAt,
        location,
        amount: null,
        note,
      }))
    }
    if (slept) {
      list.push((dogId, occurredAt, location, note) => ({
        type: 'sleep',
        dogId,
        occurredAt,
        location,
        note,
      }))
    }
    return list
  }

  const locationChanges = pendingLocation
    ? targets.some((dog) => where(dog) !== pendingLocation)
    : false
  const canSubmit = targets.length > 0 && (marks().length > 0 || locationChanges)

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
    // What the field says is what gets written — it is on screen either way.
    const occurredAt = fromLocalInput(at) ?? new Date().toISOString()

    const marked = marks()
    const created = await Promise.all(
      targets.flatMap((dog) =>
        marked.map((build, index) =>
          log(build(dog.id, occurredAt, pendingLocation ?? where(dog), index ? null : text)),
        ),
      ),
    )
    ids.push(...created.map((event) => event.id))

    if (pendingLocation) {
      // moveTo skips a dog already there, which is why the move is not just
      // another mark: a redundant row is worse than none.
      const moved = await moveTo(pendingLocation, targets, marked.length ? null : text, occurredAt)
      ids.push(...moved.map((entry) => entry.id))
    }

    const place = pendingLocation ?? shared
    const summary = pottyKind
      ? `${POTTY_PAST[pottyKind]}${place ? ` ${PLACE_PAST[place]}` : ''}`
      : barked
        ? `${BARK_LABEL}${place ? ` ${PLACE_PAST[place]}` : ''}`
        : ate
          ? `${MEAL_LABEL}${place ? ` ${PLACE_PAST[place]}` : ''}`
          : slept
            ? `${SLEEP_LABEL}${place ? ` ${PLACE_PAST[place]}` : ''}`
            : LOCATION_LABELS[pendingLocation!]
    announce(`${listNames(targets)} · ${summary}`, ids)
    reset()
  }

  return (
    // Full-bleed background and gradient rule; the controls stay on the same
    // column grid as the timeline above.
    <div className="shrink-0">
      {/* Above the rule and outside the deck, because it is the way in rather
          than part of the form. Named, too: catching up on five entries at
          once is ordinary, and an eye never said that was possible. */}
      {open ? null : (
        <div className="mx-auto w-full max-w-sm px-4 pb-[1.125rem] text-right">
          <button
            type="button"
            onClick={openDetails}
            className="press h-11 rounded-xl border border-line px-5 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            Add entry
          </button>
        </div>
      )}

      <div
        // A band of the layout rather than something stuck over it: the
        // timeline above scrolls inside its own box, so there is nothing to
        // stick to and nothing to overlap.
        className="border-t bg-surface shadow-[0_-12px_32px_-24px_rgba(0,0,0,0.45)]"
        style={{ borderTopWidth: 3, borderImage: `${spread} 1` }}
      >
        {/* The home indicator sits over the last row otherwise. */}
        <div className="mx-auto w-full max-w-sm px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {open ? (
            <input
              type="datetime-local"
              value={at}
              onChange={(event) => setAt(event.target.value)}
              aria-label="When this happened"
              // Full width like the note below it. A date field lays its own parts
              // out and will not shrink to them, so any width short of this leaves
              // a gap between the text and the picker that reads as lopsided
              // padding; filling the row makes the space deliberate instead.
              className="mb-2 w-full rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus-visible:border-ink"
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

          {open ? (
            <div className="mt-1.5 flex items-center gap-3">
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
                      data-on={on}
                      className="press deck-tile grid size-11 shrink-0 place-items-center rounded-full border"
                      style={tile(on, TILE_FILL, hint)}
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
                      data-on={on}
                      className="press deck-tile grid size-11 shrink-0 place-items-center rounded-full border"
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
                <button
                  type="button"
                  aria-pressed={barked}
                  aria-label={BARK_LABEL}
                  onClick={() => setBarked(!barked)}
                  data-on={barked}
                  className="press deck-tile grid size-11 shrink-0 place-items-center rounded-full border"
                  style={tile(barked, TILE_FILL, hint)}
                >
                  <Glyph text={BARK_GLYPH} label={BARK_LABEL} size={DETAIL_GLYPH_PX} />
                </button>

                <button
                  type="button"
                  aria-pressed={ate}
                  aria-label={MEAL_LABEL}
                  onClick={() => setAte(!ate)}
                  data-on={ate}
                  className="press deck-tile grid size-11 shrink-0 place-items-center rounded-full border"
                  style={tile(ate, TILE_FILL, hint)}
                >
                  <Glyph text={MEAL_GLYPH} label={MEAL_LABEL} size={DETAIL_GLYPH_PX} />
                </button>

                <button
                  type="button"
                  aria-pressed={slept}
                  aria-label={SLEEP_LABEL}
                  onClick={() => setSlept(!slept)}
                  data-on={slept}
                  className="press deck-tile grid size-11 shrink-0 place-items-center rounded-full border"
                  style={tile(slept, TILE_FILL, hint)}
                >
                  <Glyph text={SLEEP_GLYPH} label={SLEEP_LABEL} size={DETAIL_GLYPH_PX} />
                </button>
              </div>

            </div>
          ) : null}

          {open ? (
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={NOTE_MAX}
              aria-label="Note for this entry"
              className="mt-1.5 h-12 w-full rounded-2xl border border-line bg-surface px-4 text-sm outline-none focus-visible:border-ink"
            />
          ) : null}

          {open ? (
            // Delete keeps to this group rather than the far left, where a thumb
            // reaching for the start of the note would find it. Wide padding so
            // the three are hard to confuse under a thumb.
            <div className="mt-1.5 flex justify-end gap-2">
              {editing ? (
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="press h-11 rounded-xl border border-line px-5 text-sm font-semibold text-ink-muted hover:text-ink"
                >
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                onClick={reset}
                className="press h-11 rounded-xl border border-line px-5 text-sm font-semibold text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void (editing ? submitEdit() : submit())}
                disabled={editing ? !targets.length : !canSubmit}
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
    </div>
  )
}
