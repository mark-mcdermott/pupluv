# pupluv

Tracking where two dogs are and how house-training is going.
Live at **[www.pupluv.online](https://www.pupluv.online)**.

One tap says the dogs moved between the pen, the yard and the house. An accident
is never recorded as such — every pee and poo is logged with a place, and an
accident is simply one that did not happen outside. Logging the successes too is
what turns the weekly tally into a training signal rather than a list of failures.

Astro + React islands · Drizzle/Neon · Tailwind + shadcn/ui · Capacitor iOS with a
home-screen widget · Vercel. Private, one household, no App Store plans.

## Getting started

```bash
pnpm install
vercel env pull .env.local   # DATABASE_URL, AUTH_SECRET, PIN_HASH
pnpm dev                     # pages, the React island and /api/* on one server
```

| | |
|---|---|
| `pnpm dev` | one local server for everything |
| `pnpm verify` | check + lint + test + build — what CI runs |
| `pnpm db:push` | apply `schema.ts` to Neon |
| `pnpm db:seed [a] [b]` | create the two dogs |
| `pnpm pin:hash <pin>` | print a `PIN_HASH` for `.env.local` and Vercel |
| `pnpm ios:device` | build, sign and install on a connected iPhone |
| `pnpm icons` | regenerate the app icons from `public/favicon.svg` |

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

## What is actually in the database

Places and potty kinds are stored as **words**, in Postgres enums the database
enforces:

| column | values |
|---|---|
| `events.type` | `location`, `potty`, `meal`, `water`, `sleep` |
| `events.location` | `pen`, `outside`, `inside` |
| `events.potty_kind` | `pee`, `poo`, `both` |

The 🛖 🌳 🏠 💧 💩 in the timeline live **only in the code**. Storing them would
turn every design tweak into a data migration and make queries depend on exact
emoji bytes. Ask "how many accidents in July" against `location <> 'outside'`,
not against a picture.

The one exception is `dogs.emoji` — 🍪 and 🍜 — which is stored, because it is
per-dog identity that the widget reads from a shared container and that changes
when a dog is renamed.

## On the phone

`pnpm ios:device` builds against production, signs, installs over USB and
launches. The phone needs Developer Mode on (Settings → Privacy & Security) and
to have trusted this Mac; an untrusted phone is paired automatically.

The home-screen widget is three place buttons showing where the dogs are now.
It runs in its own process and cannot see the web view's storage, so the app
publishes what it needs into an App Group after every sync. A tap the widget
cannot deliver is queued there and adopted by the app on its next sync.

Architecture and the reasoning behind it: [AGENTS.md](AGENTS.md).
Remaining work: [docs/ROADMAP.md](docs/ROADMAP.md).
