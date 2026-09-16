import { asc } from 'drizzle-orm'
import { getDb, schema } from '../src/server/db'

// Warm/cool pair: tells the two apart at a glance outdoors, and stays
// distinguishable for the common forms of colour blindness.
const ACCENTS = ['amber', 'teal'] as const

const names = process.argv.slice(2)
const db = getDb()

const existing = await db.select().from(schema.dogs).orderBy(asc(schema.dogs.createdAt))

if (existing.length > 0) {
  console.log(`${existing.length} dog(s) already seeded: ${existing.map((d) => d.name).join(', ')}`)
  process.exit(0)
}

const seeded = await db
  .insert(schema.dogs)
  .values(
    ACCENTS.map((accent, i) => ({ name: names[i] ?? `Pup ${i + 1}`, accent })),
  )
  .returning()

console.log(`seeded: ${seeded.map((d) => `${d.name} (${d.accent})`).join(', ')}`)
