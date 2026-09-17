# 🐶 pupluv

Tracks Ramen and Oreo's "state" (pen, outside, inside, crate, bed) and their bathrooming and accidents so we can make better informed decisions on how to improve their potty-training.

## Urls

- Live at **[www.pupluv.online](https://www.pupluv.online)** (a NameCheap domain)
- Repo is at [github.com/mark-mcdermott/pupluv](https://github.com/mark-mcdermott/pupluv)

## Idea

One tap says the dogs moved between the pen, yard, loose in the house, crates or our bed. An accident is never recorded as such — every pee and poo is logged with a place, and an
accident is simply one that did not happen outside. Logging the successes too is
what turns the weekly tally into a training signal rather than a list of failures.

## Stack

- ZENCATS: **Z**od/drizzle, **E**dge/Neon (postgres), **N**ode, **C**apacitor (ios), **A**stro/React, **T**auri (mac), **S**hadcn/Tailwind
- Astro shell (for possible future static pages) with a client-rendered React app
- Deployed on Vercel, with Postgres on Neon
- Private, one household, no App Store plans

## Auth

Simple PIN-only login, no users
- PIN in 1Password
- PIN hash in `.env.local` locally, and in Vercel's env vars in production —
  scrypt with a random salt, so the file never holds the PIN itself
- The JWT it issues is a **bearer token, not a cookie**: the bundled apps run on
  `capacitor://localhost` and `tauri://localhost` and call the API cross-origin

## Install

```bash
pnpm install
vercel env pull .env.local   # DATABASE_URL, AUTH_SECRET, PIN_HASH
pnpm dev                     # pages, the React island and /api/* on one server
```

## Commands

| | |
|---|---|
| `pnpm dev` | one local server for everything |
| `pnpm verify` | check + lint + test + build — what CI runs |
| `pnpm db:push` | apply `schema.ts` to Neon |
| `pnpm db:seed [a] [b]` | create the two dogs |
| `pnpm pin:hash <pin>` | print a `PIN_HASH` for `.env.local` and Vercel |
| `pnpm ios:device` | build, sign and install on a connected iPhone |
| `pnpm desktop:dev` | the Mac app against the local dev server |
| `pnpm desktop:build` | build and sign `pupluv.app` and a `.dmg` |
| `pnpm desktop:install` | the same, then put it in `/Applications` |
| `pnpm icons` | regenerate every icon from the largest logo in `brand/` |

## Backups

The database holds real data, so it is copied somewhere that does not depend on
Neon being healthy.

```bash
pnpm db:backup    # dump now — do this before anything risky
pnpm db:restore   # put it back
```

`backups/pupluv.json` is a full dump of both tables, committed to the repo. A
scheduled workflow refreshes it **every six hours** and commits only when the
data actually changed, so **the git history is the backup history**: every commit
is a restorable point, and its diff shows exactly what moved. It can also be run
by hand from the Actions tab before a risky change.

Four copies, no two sharing a failure mode:

| copy | survives |
|---|---|
| the live Neon database | — |
| `backups/pupluv.json` on GitHub | losing Neon |
| the same file in every clone, including this Mac | losing Neon *and* GitHub |
| a 90-day workflow artifact, held apart from the repo | the repo history being rewritten |

Neon's own retention covers recent mistakes on top of those.

Three properties worth knowing before relying on it:

- **Restore is upsert-only.** It brings back what was lost and refreshes what
  changed, but never deletes a row added since the backup — so running it can
  only recover, never destroy. The corollary is that it cannot undo an unwanted
  *insert*; delete that by hand.
- **A backup refuses to write when the database returns no dogs.** An empty read
  is a failure, not news, and must never quietly overwrite a good backup.
- **The dump carries no timestamp field.** Git records when it was taken; a field
  changing on every run would commit daily even when nothing had happened.

It is JSON rather than `pg_dump` because Neon runs PostgreSQL 18 and an older
client on a CI runner cannot dump it — and because two tables are far more useful
readable and diffable than as a binary.

The restore path is exercised, not assumed: insert a throwaway row, dump, delete
it, restore, confirm it came back.

## DB Contents

Places and potty kinds are stored as **words**, in Postgres enums the database
enforces:

| column | values |
|---|---|
| `events.type` | `location`, `potty`, `meal`, `water`, `sleep` |
| `events.location` | `pen`, `outside`, `inside`, `crate`, `bed` |
| `events.potty_kind` | `pee`, `poo`, `both` |

The 🛖 🌳 🏠 💧 💩 in the timeline live **only in the code**. Storing them would
turn every design tweak into a data migration and make queries depend on exact
emoji bytes. Ask "how many accidents in July" against `location <> 'outside'`,
not against a picture.

The one exception is `dogs.emoji` — 🍪 and 🍜 — which is stored, because it is
per-dog identity that the widget reads from a shared container and that changes
when a dog is renamed.

## iPhone

`pnpm ios:device` builds against production, signs, installs over USB and
launches. The phone needs Developer Mode on (Settings → Privacy & Security) and
to have trusted this Mac; an untrusted phone is paired automatically.

The home-screen widget carries the same five place buttons, showing where the
dogs are now. Five across a small widget would be about 25pt each, so it wraps
to two rows there.
It runs in its own process and cannot see the web view's storage, so the app
publishes what it needs into an App Group after every sync. A tap the widget
cannot deliver is queued there and adopted by the app on its next sync.

## Mac

`pnpm desktop:install` builds the app and puts it in `/Applications`, which is
the whole round trip. `pnpm desktop:build` stops at
`desktop/target/release/bundle/`, leaving a signed `pupluv.app` and a `.dmg`
there.

Same bundle as the phone, in a 420pt window: Tauri serves the built files from
`tauri://localhost` and the app calls the deployed API cross-origin, exactly as
Capacitor does. The window remembers where you left it.

Signing uses whichever **Developer ID Application** certificate is in the
keychain. That is enough for a build that stays on this Mac — Gatekeeper only
assesses apps carrying a quarantine flag, which one built here does not. Copy the
`.dmg` to another machine and it *will* be refused until it is notarised, which
is on the roadmap.

`pnpm desktop:dev` opens the same window against `localhost:4321`, starting the
dev server only if one is not already up.

## File Structure

- From the Astro scaffold: `public/`, `src/`, and the configs at the root
- `iphone/` is the Xcode project — the ios app (Capacitor) and the widget (Swift)
- `desktop/` is the Tauri project — the Mac app. Flat rather than the usual
  `src-tauri/`: the CLI finds `tauri.conf.json` wherever it sits, and there is
  only ever one native shell per platform folder here
- `iphone/App/App/` reads oddly for two separate reasons
  - the nesting is Xcode's own `Foo/Foo.xcodeproj` + `Foo/Foo/` convention
  - the *name* is Capacitor's: both `App`s are hardcoded in its config resolver,
    so neither can be renamed. `iphone/` could be, via `ios.path`. The app's
    display name is `appName` in `capacitor.config.ts`, and is already `pupluv`
  - inside it, `App/`, `Widget/` and `Shared/` are siblings — the app target's
    sources, the widget target's, and the Swift compiled into both
- Added by me
  - `brand/`: the logo the icons are generated from. `pnpm icons` takes the
    largest `logo*.png` in here, so a re-export at new dimensions needs no code
    change — pass a path to override
  - `backups/`: database dumps, committed
  - `scripts/`: backup, restore, icons, iphone install, mac build, Xcode project
    edits
  - `docs/`: the roadmap
  - `.github/`: CI and the scheduled backup
  - `CLAUDE.md`: a **symlink** to `AGENTS.md` — edit `AGENTS.md`, since staging
    `CLAUDE.md` by name stages the link rather than the file
- Added by Vercel when Neon was provisioned
  - `.agents/skills/`: two Neon skills, with `.claude/skills/` symlinked to them
  - `skills-lock.json`: pins their versions

## More Details

- Architecture and the reasoning behind it: [AGENTS.md](AGENTS.md).
- Remaining work: [docs/ROADMAP.md](docs/ROADMAP.md).
