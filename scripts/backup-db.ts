import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { asc } from 'drizzle-orm'
import { getDb, schema } from '../src/server/db'

const out = process.argv[2] ?? 'backups/pupluv.json'
const db = getDb()

// Deterministic order, so a diff shows what actually changed rather than a
// reshuffle.
const dogs = await db.select().from(schema.dogs).orderBy(asc(schema.dogs.createdAt), asc(schema.dogs.id))
const events = await db
  .select()
  .from(schema.events)
  .orderBy(asc(schema.events.occurredAt), asc(schema.events.id))

// A dump with no dogs means the read failed, not that the dogs left. Never let
// that overwrite a good backup.
if (dogs.length === 0) {
  console.error('refusing to write: the database returned no dogs, which is a read failure')
  process.exit(1)
}

// No timestamp field on purpose. Git records when each backup was taken, and a
// field that changes every run would commit daily even when nothing happened.
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify({ schema: 1, dogs, events }, null, 2)}\n`)

console.log(`${out}: ${dogs.length} dogs, ${events.length} events`)
