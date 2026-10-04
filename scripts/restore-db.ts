import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { getDb, schema } from '../src/server/db'

/**
 * Restores rows from a backup. Upsert only: it brings back what was lost and
 * refreshes what changed, but never deletes a row added since the backup — so
 * running it can lose nothing, only recover.
 */
const file = process.argv[2] ?? 'backups/pupluv.json'
const payload = JSON.parse(readFileSync(file, 'utf8'))

if (payload.schema !== 1) {
  console.error(`unknown backup schema ${payload.schema}`)
  process.exit(1)
}

const date = (value: string | null) => (value ? new Date(value) : null)
const db = getDb()

const dogs = payload.dogs.map((dog: Record<string, string>) => ({
  ...dog,
  createdAt: date(dog.createdAt)!,
}))

const events = payload.events.map((event: Record<string, string | null>) => ({
  ...event,
  occurredAt: date(event.occurredAt as string)!,
  deletedAt: date(event.deletedAt as string | null),
  createdAt: date(event.createdAt as string)!,
  updatedAt: date(event.updatedAt as string)!,
}))

// Dogs first: events reference them.
if (dogs.length) {
  await db
    .insert(schema.dogs)
    .values(dogs)
    // `user_id` is deliberately not among these: a restore brings back what a
    // dog is, never who it belongs to. Re-running an old dump should not hand
    // somebody's dogs back to whoever owned them at the time.
    .onConflictDoUpdate({
      target: schema.dogs.id,
      set: {
        name: sql`excluded.name`,
        accent: sql`excluded.accent`,
        emoji: sql`excluded.emoji`,
      },
    })
}

if (events.length) {
  await db
    .insert(schema.events)
    .values(events)
    .onConflictDoUpdate({
      target: schema.events.id,
      set: {
        location: sql`excluded.location`,
        pottyKind: sql`excluded.potty_kind`,
        amount: sql`excluded.amount`,
        note: sql`excluded.note`,
        deletedAt: sql`excluded.deleted_at`,
        // Bumped so every device pulls the restored state.
        updatedAt: sql`clock_timestamp()`,
      },
    })
}

console.log(`restored from ${file}: ${dogs.length} dogs, ${events.length} events`)
