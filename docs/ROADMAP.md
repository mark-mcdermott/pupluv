# pupluv roadmap

Shipped and remaining work, in PR-sized pieces with acceptance criteria.

## Done — v1: potty and location

- Two dogs, tracked separately, renameable in place.
- Location as a mode (pen / outside / inside); current location is the latest event.
- One-tap pee / poo / both, filed at the dog's current location.
- Accidents derived, never stored. Weekly "n of m outside" per dog.
- Local-first: IndexedDB + outbox, background sync, tombstone undo.
- A "Both" option that logs one entry per dog from a single tap, each filed at
  that dog's own location.
- Optional notes: attach one to the entry as you log it, or add and edit it from
  the timeline afterwards.
- Shared-PIN auth, bearer token, 90-day expiry.
- iOS shell via Capacitor, bundled for offline use, with a home-screen widget.
- A Mac app via Tauri, from the same bundle, signed with the Developer ID cert.
- The timeline covers every day, not just today, under day headings.
- Light/dark, WCAG AA contrast, reduced-motion respected.

## Parked

### Per-dog state cards
The two cards above the timeline (current place, time there, weekly "n of m
outside") were hidden on request — the deck's place row now carries "where are
they", since the lit button is where they currently are. `DogCard.tsx` is in git
history if they come back; `tallyPotty` and `sinceLabel` are still here and
tested. **Renaming a dog went with them** — the only UI for it was tapping the
name on the card. `PATCH /api/dogs` still works.

## Next

### 1. Meals, water and sleep
Sleep is already half-answered: `crate` and `bed` are places, so time asleep can
be derived from location events rather than logged separately.
The schema, the Zod union and the timeline already carry these — this is UI only,
no migration. A second deck tab, or a long-press on the dog card.
**Done when** the three types can be logged and appear in the timeline, and the
CHECK constraints reject a meal with no amount.

### 2. A week view
The timeline lists every day, but there is no shape to it yet — no way to see
last week's pattern at a glance. The data is already there and indexed on
`(dog_id, occurred_at desc)`.
**Done when** you can see a week at a time and the tally matches the timeline.

### 3. Notarise the Mac app
`pnpm desktop:build` signs with the Developer ID certificate, which is enough for
a build that never leaves this Mac. Anything downloaded needs notarising, or
Gatekeeper refuses it outright.
**Done when** the build notarises and staples, given an App Store Connect API key
in the environment.

## Deliberately not doing

- **Per-user accounts.** One household, one PIN. Revisit only if it leaves the house.
- **A separate accidents table.** See CLAUDE.md — accidents are derived.
- **Push notifications / reminders.** No evidence they're wanted yet.
