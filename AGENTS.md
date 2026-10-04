# pupluv

Tracks where dogs are and how house-training is going. Accounts, a dog or more
per account, phone-first.

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
pnpm db:claim <email> # hand the pre-account dogs to an account
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
- `src/server/` — db client (lazy, never a Proxy), Better Auth, row mappers.
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

### Auth and ownership

Better Auth, email and password, with the **`bearer` plugin** — the bundled apps
run on `capacitor://localhost` and `tauri://localhost` and call the API
cross-origin, where cookies are a fight. `set-auth-token` comes back on sign-in
and sign-up and `Authorization: Bearer` resolves it after, and the token is kept
on every surface rather than only the native ones, so there is one code path
instead of two.

`NATIVE_ORIGINS` lives in `src/server/auth.ts` and `src/middleware.ts` imports
it. Better Auth has to *trust* an origin to sign in from it and the middleware
has to answer that origin's *preflight*; two copies of the list would drift, and
the half that broke would be the one only a bundled build exercises. The dev
server keeps its own guard in `astro.config.mjs` under `security.allowedDomains`
— a third place, because it is a different program. `src/middleware.test.ts`
holds the list.

**A dog belongs to a user; an event belongs to a dog.** There is no owner column
on `events` — the pull joins through `dogs`, and the push reuses the
does-this-dog-exist check that was already there, narrowed to this user. Somebody
else's dog id is simply not among the rows it returns, so it reads as unknown and
gets the 400 that was already the answer for a dog that was never there. There is
no separate authorisation step to forget.

`dogs.user_id` is nullable only because rows predating accounts had to be adopted
rather than dropped: sign up, then `pnpm db:claim <email>`. Everything written
since belongs to somebody.

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
  on its next sync. Only one outbox ever retries, and it is the app's. A 401 is
  queued rather than dropped — the batch is fine, the session is not, and the app
  can mint a new token. Every other 4xx is dropped, because keeping something the
  server will never take wedges the queue behind it.
- **A staged place is an outline; where they are is a fill.** Nothing is written
  until send, so the two cannot look alike — a tap that only staged a place used
  to be indistinguishable from the dogs having moved, which is exactly how the
  widget came to look broken. Staging a place they are already in keeps the fill,
  because it is not an intention to do anything and send is dimmed for it.
- **The widget says when it cannot act.** Send is dimmed whenever it would write
  nothing — a place they are already in, or every dog left out — and carries a
  count of taps still waiting. Both exist because a tap that did nothing used to
  reset the row in silence, which is indistinguishable from being broken.
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

## Glyphs

Emoji are drawn either by the system font or by vendored Twemoji artwork, and
`GLYPH_STYLE` in `src/app/lib/glyphs.ts` picks which. Images exist so a glyph can
be replaced by a better one — the cookie wants to be an Oreo — without every dog
on the phone having to agree it is a cookie.

`pnpm glyphs` copies what the app draws out of `@twemoji/svg` into
`public/glyphs/`, named for the code points with the variation selector dropped,
which is Twemoji's own convention. It reads the vocabulary from `domain.ts` and
the dogs' own emoji from the committed backup, and fails rather than leaving a
blank space if a glyph has no artwork. Vendored, never fetched: this app has to
work with no signal.

A glyph string can hold more than one emoji — `both` is `💧💩`, and a potty with
a bark is another — so `Glyph` splits on graphemes and draws one image each.

`brand/glyphs/<codepoint>.svg` overrides Twemoji for that glyph — kept here and
preferred over the package, so `pnpm glyphs` will not overwrite it. The database
is untouched by any of this: it stores the emoji, and only the artwork changes.

- **🍪** is drawn from scratch. The cookie emoji is a brown disc that all but
  vanishes on the dark ground, and no sandwich cookie exists in the emoji set to
  swap it for. Every measurement is a proportion of the radius, so resizing it is
  one number.
- **💧** is Twemoji's own droplet with the fill changed and nothing else. Its blue
  reads as water, and this is not water; the shape has to keep matching the poo
  beside it.

`TUNING` in `Place.tsx` holds per-glyph optical corrections, and only the
timeline asks for them. They are not artwork bugs: a row draws every glyph at one
size edge to edge with its neighbours, and at that scale a few read a shade
heavy, high or left against the rest. The deck draws the same art isolated inside
a tile where none of it shows, and the widget is a separate build that never sees
the file — which is why the correction lives there rather than in the SVG, where
it would follow the glyph everywhere.

A size correction never changes the box. The glyph is drawn smaller inside a slot
of the full size, so the columns stay where they are.

The widget draws the same artwork as PNGs, since SwiftUI reads an SVG only out of
an asset catalog. They live in `iphone/App/Widget/Glyphs` as a **folder
reference**, so a glyph that arrives from `pnpm glyphs` is bundled without the
Xcode project being touched again. Swift iterates grapheme clusters natively,
which is the same split the web makes, and falls back to the character when a
glyph has no artwork — a dog renamed on the phone still shows something.

The switch is carried separately there; they are different builds and cannot
share a constant.

### Marks

A potty, a bark and a meal are separate arms of the union that share an entry:
one tap can write all three plus the move, and the timeline folds them back into
a single row. The note belongs to the entry rather than to any one event in it,
so it rides on the first written and the rest carry null — `marks()` in the deck
is the one list that decides both the order and who gets the note.

`meal` carries an optional amount for a UI that one day cares about cups. Nothing
requires it: that a bowl went down, and when, is the whole entry today.

One list, in `domain.ts`, holds the kinds that share the glyph column: `MARKS`.
Five separate places used to name those types inline — what groups a row, what
reserves the column, what draws it, where it is filed, how it reads aloud — and
every one of them was missed when a fourth kind arrived. `placeOf` answers the
place question once; water is the only kind without one.

`sleep` is marked, not timed. It once carried an `ended_at` for an interval and
never used it — the next entry closes the stretch anyway, which is how a move to
the crate at 9pm already reads as ten hours. The column is gone.

The row is at its limit. On the web, seven circles fit at 44px only because the
gaps gave way first — 44px is the floor, so an eighth mark has to wrap.

The widget diverges from the deck on purpose. It has no fold and no eye: the row
is always open, so a place tap only says where, and the paper plane is the one
thing that writes. That costs the widget its one-tap move, and buys back the
width the eye took — its eight circles are sized to fill the row rather than to a
fraction of the tile above. Tapping the lit place again takes it back, which is
the only way to undo a mis-tap now that nothing commits on its own.

## Export

The download button between the sync dot and the theme toggle writes every live
event as CSV. It is built from what is already on the device — the timeline holds
the whole history — so it needs no signal and asks the server for nothing.

One row per event, oldest first. `date`, `time`, `weekday` and `hour` are local
rather than UTC, because the question the file answers is *when do accidents
happen* and 11pm Saturday is the answer, not the instant it maps to elsewhere.
`accident` is a column because it is derived from the location rather than
stored, and blank rather than false for anything but a potty — a bark indoors is
not an accident.

The web view cannot download: there is no Downloads folder at
`capacitor://localhost`, and an `<a download>` there does nothing at all. The
phone gets the share sheet instead, which is what puts the file in Files or a
mail draft. On the web, the object URL is revoked on a later tick — the click
only queues the download, and revoking before the browser has read the blob
cancels it.

## Backups

A scheduled workflow dumps both tables every six hours into the separate private
repository `mark-mcdermott/pupluv-daily-backups`, keeping `latest.json`, the last 14
dated snapshots and the first of each of the last 6 months.

Snapshots are **not** committed here. They were until 2026-10-03, which meant this
repository published its own database every six hours and could not be made public.
`backups/` is gitignored; a local `pnpm db:backup` still writes there and is simply
never committed.

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
