import { z } from 'zod'

export const LOCATIONS = ['pen', 'outside', 'inside', 'crate', 'bed'] as const
export const POTTY_KINDS = ['pee', 'poo', 'both'] as const
export const EVENT_TYPES = ['location', 'potty', 'bark', 'meal', 'water', 'sleep'] as const

export type Location = (typeof LOCATIONS)[number]
export type PottyKind = (typeof POTTY_KINDS)[number]
export type EventType = (typeof EVENT_TYPES)[number]

export const LOCATION_LABELS: Record<Location, string> = {
  pen: 'Pen',
  outside: 'Outside',
  inside: 'Inside',
  crate: 'Crate',
  bed: 'Bed',
}

/** Reads as a sentence on the dog card: "In the pen for 2h". */
export const LOCATION_PHRASES: Record<Location, string> = {
  pen: 'In the pen',
  outside: 'Outside',
  inside: 'Inside',
  crate: 'In the crate',
  bed: 'In our bed',
}

// Not "Both" — the dog selector directly above owns that word, and two
// adjacent Both buttons meaning different things is a mis-tap waiting to happen.
export const POTTY_LABELS: Record<PottyKind, string> = {
  pee: 'Pee',
  poo: 'Poo',
  both: 'Pee + Poo',
}

/**
 * Emoji throughout, so places and dogs speak one visual language — a line icon
 * beside a full-colour emoji reads as a stray mark whatever size it is. Kept
 * here with the labels rather than in the component that draws them, so the
 * script that vendors their artwork can read the same list.
 */
export const LOCATION_GLYPHS: Record<Location, string> = {
  pen: '🛖',
  outside: '🌳',
  inside: '🏠',
  crate: '📦',
  bed: '🛏️',
}

/** The timeline is glyphs; the words stay on the deck buttons and in a11y names. */
export const POTTY_GLYPHS: Record<PottyKind, string> = {
  pee: '💧',
  poo: '💩',
  both: '💧💩',
}

/**
 * Barking is its own kind of event, not a kind of potty: it is never an
 * accident, it has no relationship to being house-trained, and what matters
 * about it is when and where — 6am on a Saturday, 11pm on a weekday.
 */
export const BARK_GLYPH = '🗯️'
export const BARK_LABEL = 'Barked'

/**
 * Eating is marked the same way, and for the same reason: what matters is that
 * it happened and when. The amount stays on the type for a future UI that cares
 * about cups, but nothing is required to say a bowl went down.
 */
export const MEAL_GLYPH = '🦴'
export const MEAL_LABEL = 'Ate'

const isoDate = z.iso.datetime({ offset: true })
const nullableIso = isoDate.nullish().transform((v) => v ?? null)

/**
 * Notes ride along a timeline row rather than sitting under it, so they have to
 * fit one. Short enough to read at a glance is the point, not the limit.
 */
export const NOTE_MAX = 30

const eventBase = {
  /** Minted on the device so replaying a queued write is idempotent. */
  id: z.uuid(),
  dogId: z.uuid(),
  occurredAt: isoDate,
  note: z.string().trim().max(NOTE_MAX).nullish().transform((v) => v || null),
  deletedAt: nullableIso,
}

/**
 * The shape of each event type, mirroring the CHECK constraints on the table.
 * Parsing at the API boundary means a malformed event is rejected with a useful
 * message instead of a constraint violation.
 */
export const eventSchema = z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('location'), location: z.enum(LOCATIONS) }),
  z.object({
    ...eventBase,
    type: z.literal('potty'),
    location: z.enum(LOCATIONS),
    pottyKind: z.enum(POTTY_KINDS),
  }),
  z.object({ ...eventBase, type: z.literal('bark'), location: z.enum(LOCATIONS) }),
  z.object({
    ...eventBase,
    type: z.literal('meal'),
    location: z.enum(LOCATIONS),
    amount: z.number().positive().max(100).nullish().transform((v) => v ?? null),
  }),
  z.object({ ...eventBase, type: z.literal('water'), amount: z.number().positive().max(500) }),
  z.object({ ...eventBase, type: z.literal('sleep'), endedAt: nullableIso }),
])

export type PupEvent = z.infer<typeof eventSchema>

/** Plain `Omit` flattens a union into one object; this keeps the arms apart. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** An event as the UI supplies it — identity and tombstone are added on write. */
export type DraftEvent = DistributiveOmit<PupEvent, 'id' | 'deletedAt'>
export type PottyEvent = Extract<PupEvent, { type: 'potty' }>
export type LocationEvent = Extract<PupEvent, { type: 'location' }>

export const eventBatchSchema = z.array(eventSchema).min(1).max(200)

export const dogSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40),
  accent: z.string().trim().min(1).max(20),
  emoji: z.string().trim().min(1).max(8),
})

export type Dog = z.infer<typeof dogSchema>

/**
 * The whole point of logging location separately: an accident is not its own
 * kind of record, it is any elimination that did not happen outside. Logging
 * the successes too is what turns this into a training signal.
 */
export function isAccident(event: PupEvent): boolean {
  return event.type === 'potty' && event.location !== 'outside'
}

export function isLive(event: PupEvent): boolean {
  return event.deletedAt === null
}

/** Current location is simply the most recent location event. */
export function latestLocationEvent(events: PupEvent[], dogId: string): LocationEvent | null {
  let latest: LocationEvent | null = null
  for (const event of events) {
    if (event.type !== 'location' || event.dogId !== dogId || !isLive(event)) continue
    if (!latest || event.occurredAt > latest.occurredAt) latest = event
  }
  return latest
}

export function currentLocation(events: PupEvent[], dogId: string): Location | null {
  return latestLocationEvent(events, dogId)?.location ?? null
}

/**
 * Where a potty event gets filed when the dog's location was never set. A house
 * dog is indoors by default, and the deck always shows the location it is about
 * to record, so this is visible rather than silent.
 */
export const DEFAULT_LOCATION: Location = 'inside'

export type PottyTally = { outside: number; accidents: number; total: number }

export function tallyPotty(events: PupEvent[], dogId: string, since: Date): PottyTally {
  const cutoff = since.toISOString()
  let outside = 0
  let accidents = 0
  for (const event of events) {
    if (event.type !== 'potty' || event.dogId !== dogId || !isLive(event)) continue
    if (event.occurredAt < cutoff) continue
    if (event.location === 'outside') outside += 1
    else accidents += 1
  }
  return { outside, accidents, total: outside + accidents }
}
