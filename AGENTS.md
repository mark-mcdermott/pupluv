# pupluv

Tracks where two dogs are and how house-training is going. Personal app, one
user, phone-first.

## Stack — ZENCATS

Astro 7 (static) · React 19 islands · Tailwind 4 · shadcn/ui · Drizzle + Neon ·
Zod 4 · Capacitor (iOS) · Tauri (macOS) · Vercel. Follows the house direction set in
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
pnpm ios:device     # build, sign and install on a connected iPhone
pnpm desktop:dev    # the Mac app against the dev server
pnpm desktop:build  # signed pupluv.app and .dmg
pnpm desktop:install  # the same, into /Applications
```

## The two ideas worth knowing

**A bark is its own kind of event, not a kind of potty.** It is never an
accident, it has nothing to do with house-training, and what matters about it is
when and where — 6am on a Saturday, 11pm on a weekday. It shares the potty
buttons' row because that row is "what happened", and shares an entry with a
potty when both are logged at once, but it is a separate arm of the union with
its own CHECK constraint. Never fold it into `POTTY_KINDS`.

**An accident is derived, not recorded.** Every elimination is logged with a
type *and* a location. `isAccident` is `location !== 'outside'`. Logging the
successes too is what makes the weekly tally a training signal instead of a
failure log. Never add an `isAccident` column.

**Location is a mode; potty is an event that inherits it.** The dog's current
location is just its most recent `location` event. A potty entry files itself at
that location, which is what makes the common case one tap. The deck always
displays the location it is about to use, so the inheritance is never a guess.

**The deck has three states and they behave differently on purpose.** Closed, it
is five place buttons and a tap is the whole entry, applied to every dog — the
lit one is where they are now. The eye beneath them opens a row of circles —
dogs, pee, poo, send — over a note field, and once that row is open nothing is
written, not even a place, until send. Anything that blurs that line will make
the deck lie about what a tap does, which is the exact confusion this replaced.

The third state is an edit. **The timeline row is the control** — there are no
per-row buttons — and tapping one hands its entry down for the deck to wear: the
place that was logged, the dogs and picks it covered, its note. Delete joins
Cancel and Submit, and `Shell` holds the entry because the timeline starts the
edit and the deck finishes it.

Open and editing are otherwise the same screen. Both carry an editable time above
the places, both end in the same buttons, and there is no send glyph — a row of
circles ending in one more circle never said which of them wrote the entry.

**The timeline runs oldest first**, so it reads the way the day happened and the
newest entry is the one nearest the deck. `Shell` scrolls the list to the bottom
whenever the event count changes, which is what keeps that entry in view. The way
in is a named `Add entry` above the rule rather than an eye: catching up on five
entries at once is ordinary, and an eye never said that was possible.

**An edit replaces rather than updates.** Submitting tombstones every event in
the entry and writes the row as it stands. Nothing else could change which dogs
a row covers or when it happened, and it keeps events immutable, which the sync
relies on. The effect that dresses the deck watches the entry alone — every sync
hands down a fresh dogs array, and reacting to that would wipe a half-finished
edit once a minute.

The circles are three quarters of a place, and the gaps are measured against the
circle rather than fixed: tight within a group, loose between them, so dogs /
pee and poo / send / the eye read as four things rather than one run of six. The
widget derives the same proportions from its own tile width.

## Architecture

- `src/lib/domain.ts` — the Zod discriminated union, shared by client and server.
  The CHECK constraints in `schema.ts` mirror it; change both together.
- `src/server/` — db client (lazy, never a Proxy), PIN auth, row mappers.
- `src/pages/api/` — `prerender = false`. Everything else prerenders so the whole
  UI can be bundled into the iOS webview.
- `src/app/` — the React island. `lib/sync.ts` is the local-first engine.
- `src/app/components/Shell.tsx` — signed-in layout, free of data loading so it
  renders from tests. **Three bands filling the viewport: header, timeline,
  deck, and only the middle one scrolls.** A scrollable document rubber bands on
  a phone — drag anywhere and the whole app slides out from under the status bar
  and back, showing the web view behind it. `html, body` are therefore fixed at
  `height: 100%; overflow: hidden`, and the timeline's box carries
  `overscroll-contain` so its own scroll does not chain back to them. `min-h-0`
  on that box is load-bearing: without it a flex child will not shrink below its
  content, and the box grows instead of scrolling.

  That also means the web view owns no insets — `contentInset: 'never'` in
  `capacitor.config.ts` — and the layout pads itself out of the status bar and
  the home indicator with `env(safe-area-inset-*)`. Let the scroll view inset
  instead and the page sits offset with nowhere to scroll it back.

### Local-first sync

Taps write to IndexedDB and an outbox first; the network happens after. Event ids
are minted on the device, so replaying the outbox is idempotent (`onConflictDoUpdate`).
Pull is cursor-based on `created_at`. Deletes are tombstones — undo has to reach
the other devices. An event is immutable once logged apart from `deleted_at`:
editing an entry tombstones it and writes a new one, which is the only way to
change which dogs a row covers or when it happened.

### Auth

One shared PIN, scrypt-hashed in `PIN_HASH`, exchanged for a 90-day JWT held as a
**bearer token, not a cookie** — the bundled apps run on `capacitor://localhost`
and `tauri://localhost` and call the API cross-origin, where cookies are a fight.

Every bundled scheme has to be listed twice: in `src/middleware.ts`, which sets
the CORS headers production sends, and in `astro.config.mjs` under
`security.allowedDomains`, which is the dev server's own cross-site guard. Miss
either and the browser keeps working while the shipped app cannot sign in.
`src/middleware.test.ts` holds the list.

## Running it on a phone

`pnpm ios:device` does the whole round trip: builds the web app against
production, syncs it into the shell, signs a Release build and installs it over
USB. The phone needs Developer Mode on (Settings → Privacy & Security) and to
have trusted this Mac.

Signing is automatic against team `VRFF4MSHAC`, which is a paid membership — so
the build lasts until the provisioning profile expires rather than the seven days
a free personal team gets. There is no App Store involvement and none is planned.

## The home-screen widget

`iphone/App/Widget` is a WidgetKit extension: the deck, on the home screen. The
same five square places, the same eye holding the right edge beneath them, the
same row of circles behind it — minus the note, because a widget cannot take
typed input.

Two things it cannot mirror and does not try to. It keeps the **send circle**
the web replaced with a Submit button: there is no room for a row of labelled
buttons under the circles, and something has to write the entry. And it keeps
the **eye**, which the web replaced with `Add entry`, because a word does not fit
where the eye sits. Six circles and the eye are what a medium widget holds, which
is why they sit at 0.65 of a place there against 0.75 on the web. Five across is about 20pt each on a small widget, so it
wraps to two rows there and the detail row only opens where it fits. Buttons in a
widget are App Intents, which is why everything targets iOS 17.

A widget view keeps no state of its own, so the detail row lives in the App Group
too: each tap runs an intent that writes there and asks for a redraw, and the
entry read back on the next draw is what the row shows.

It runs in its own process and cannot see this web view's storage, so the two
sides meet in the App Group `group.com.pupluv.app`:

- **The app publishes** the token, API origin, dogs and current placements after
  every sync (`src/app/lib/native.ts` → `SharedStorePlugin.swift`). The widget is
  a reader; it never owns the session.
- **The widget queues** a tap it could not deliver, and the app adopts that queue
  on its next sync. Only one outbox ever retries, and it is the app's.
- `iphone/App/Shared/*.swift` compiles into **both** targets. Keep it free of
  Capacitor imports or the widget will not build.

The Xcode project is scripted, not hand-edited: `scripts/xcode.sh <ruby file>`
runs against the xcodeproj gem inside Homebrew's CocoaPods, and
`scripts/add-widget-target.rb` is idempotent.

## The Mac app

`desktop/` is a Tauri v2 project, flat rather than the usual `src-tauri/` — the
CLI finds `tauri.conf.json` wherever it sits. There is almost no Rust: `main.rs`
opens a window and registers one plugin. The web app never calls into Rust, so
there are no commands and the capability file grants only the defaults.

That plugin is `window-state`, and it earns its place: Tauri builds its windows
from the config on every launch, so without it the window re-centres at 420x860
each time. The version comes from `package.json` — `tauri.conf.json` points at
the file rather than repeating the number.

It is the phone's approach on a desktop: `frontendDist` is the same
`dist/client`, `PUBLIC_API_URL` is baked in at build time, and the window loads
from `tauri://localhost`. Verified rather than assumed — a bundled build pointed
at a local listener showed `Origin: tauri://localhost` with
`Sec-Fetch-Site: cross-site`, which is why both the middleware and
`allowedDomains` need it.

The CSP in `tauri.conf.json` pins `connect-src` to the API origins. It has to
allow `'unsafe-inline'` for scripts because the theme is set inline before first
paint, so the value it adds is stopping the page talking to anywhere else.

Icons come from `pnpm icons` like every other one. macOS draws no mask, so the
rounded tile is part of the art: an 824pt tile on a clear 1024 canvas, per
Apple's grid, then `iconutil` for the `.icns`.

## Backups

`backups/pupluv.json` is a full dump of both tables, committed to the repo. A
scheduled workflow refreshes it every six hours and commits only when the data
actually changed, so the git history *is* the backup history — each commit is a
restorable point, and a diff shows exactly what moved.

```bash
pnpm db:backup                    # dump now, before anything risky
pnpm db:restore                   # put it back
pnpm db:restore path/to/file.json # or from a specific dump
```

Four copies, none depending on the same thing: the live Neon database, the
committed dump on GitHub, the same dump in every clone of this repo, and a
90-day workflow artifact held separately from the repository. Neon's own history
retention is a fifth for recent mistakes.

Two deliberate properties:

- **Restore is upsert-only.** It brings back what was lost and refreshes what
  changed, but never deletes a row added since the backup — so running it can
  only recover, never destroy. It cannot undo an unwanted *insert*.
- **The dump carries no timestamp field.** Git records when it was taken, and a
  field that changed every run would commit daily even when nothing happened.
- The backup refuses to write when the database returns no dogs: an empty read
  is a failure, not news, and must never overwrite a good backup.

JSON rather than `pg_dump` because Neon runs PostgreSQL 18 and an older client on
a CI runner cannot dump it — and because a two-table dump is more useful
readable and diffable than as a binary.

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
