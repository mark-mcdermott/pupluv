# pupluv

Tracks where two dogs are and how house-training is going. Personal app, one
user, phone-first.

## Stack — ZENCATS

Astro 7 (static) · React 19 islands · Tailwind 4 · shadcn/ui · Drizzle + Neon ·
Zod 4 · Capacitor (iOS) · Vercel. Follows the house direction set in
`~/Dev/_PROJECTS.md`: Astro shell, React applet as a `client:only` island,
one deploy target. `fullstackwolfpack` is the reference implementation.

## Commands

```bash
pnpm dev            # single dev server: pages, island, and /api/* together
pnpm verify         # check + lint + test + build — the loop that must stay green
pnpm db:push        # apply schema.ts to Neon
pnpm db:seed [a] [b]  # create the two dogs (idempotent)
pnpm pin:hash <pin> # print a PIN_HASH for .env.local and Vercel
pnpm cap:sync       # build and copy into the iOS shell (needs PUBLIC_API_URL)
pnpm cap:ios        # open Xcode
```

## The two ideas worth knowing

**An accident is derived, not recorded.** Every elimination is logged with a
type *and* a location. `isAccident` is `location !== 'outside'`. Logging the
successes too is what makes the weekly tally a training signal instead of a
failure log. Never add an `isAccident` column.

**Location is a mode; potty is an event that inherits it.** The dog's current
location is just its most recent `location` event. A potty tap files itself at
that location, which is what makes logging one tap. The deck always displays the
location it is about to use, so the inheritance is never a hidden guess.

## Architecture

- `src/lib/domain.ts` — the Zod discriminated union, shared by client and server.
  The CHECK constraints in `schema.ts` mirror it; change both together.
- `src/server/` — db client (lazy, never a Proxy), PIN auth, row mappers.
- `src/pages/api/` — `prerender = false`. Everything else prerenders so the whole
  UI can be bundled into the iOS webview.
- `src/app/` — the React island. `lib/sync.ts` is the local-first engine.
- `src/app/components/Shell.tsx` — signed-in layout, free of data loading so it
  renders from tests.

### Local-first sync

Taps write to IndexedDB and an outbox first; the network happens after. Event ids
are minted on the device, so replaying the outbox is idempotent (`onConflictDoUpdate`).
Pull is cursor-based on `created_at`. Deletes are tombstones — undo has to reach
the other devices. Everything but `deleted_at` and `note` is immutable once logged.

### Auth

One shared PIN, scrypt-hashed in `PIN_HASH`, exchanged for a 90-day JWT held as a
**bearer token, not a cookie** — the bundled iOS app runs on `capacitor://localhost`
and calls the API cross-origin, where cookies are a fight.

## Conventions

- Commits: conventional, lowercase, no period. Branch + PR, never auto-merge.
- Design tokens live in `src/styles/global.css`; shadcn's semantic tokens are
  mapped onto them so there is only ever one palette. Dark mode flips the tokens,
  so there is no parallel dark block to maintain.
- TypeScript is pinned to 6.x: TS 7's native compiler drops the API `astro check`
  needs.
- **Testing the API with curl does not prove the native client works.** curl sends
  no `Sec-Fetch-*` headers, so it skips the dev server's cross-origin guard
  entirely — a request that passes from curl can still 403 from the simulator.
  Send `Origin: capacitor://localhost` and `Sec-Fetch-Site: cross-site` when
  checking anything the native app depends on.
