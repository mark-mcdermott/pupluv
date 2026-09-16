import type { APIRoute } from 'astro'
import { asc, gt, inArray, sql } from 'drizzle-orm'
import { eventBatchSchema } from '@/lib/domain'
import { isAuthed, unauthorized } from '@/server/auth'
import { getDb, schema } from '@/server/db'
import { fromRow, toRow } from '@/server/events'

export const prerender = false

const PAGE_SIZE = 500

/** Pull: everything the server *changed* after the client's cursor — not just
 *  what it created, or edits and deletes would never reach another device. */
export const GET: APIRoute = async ({ request, url }) => {
  if (!(await isAuthed(request))) return unauthorized()

  const since = url.searchParams.get('since')
  const sinceDate = since ? new Date(since) : null
  if (sinceDate && Number.isNaN(sinceDate.valueOf())) {
    return Response.json({ error: 'invalid cursor' }, { status: 400 })
  }

  const rows = await getDb()
    .select()
    .from(schema.events)
    .where(sinceDate ? gt(schema.events.updatedAt, sinceDate) : undefined)
    .orderBy(asc(schema.events.updatedAt))
    .limit(PAGE_SIZE)

  return Response.json({
    events: rows.map(fromRow),
    cursor: rows.at(-1)?.updatedAt.toISOString() ?? since,
    more: rows.length === PAGE_SIZE,
  })
}

/** Push: drain of the device outbox. Idempotent — ids come from the client. */
export const POST: APIRoute = async ({ request }) => {
  if (!(await isAuthed(request))) return unauthorized()

  const parsed = eventBatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'invalid events', issues: parsed.error.issues }, { status: 400 })
  }

  // A foreign-key violation would surface as a 500, which the client treats as
  // transient and retries forever. An unknown dog is the client's mistake, so
  // say so with a 400 and let it drop the batch.
  const db = getDb()
  const dogIds = [...new Set(parsed.data.map((event) => event.dogId))]
  const known = await db
    .select({ id: schema.dogs.id })
    .from(schema.dogs)
    .where(inArray(schema.dogs.id, dogIds))
  const missing = dogIds.filter((id) => !known.some((dog) => dog.id === id))
  if (missing.length) {
    return Response.json({ error: 'unknown dog', dogIds: missing }, { status: 400 })
  }

  const rows = parsed.data.map(toRow)
  await db
    .insert(schema.events)
    .values(rows)
    // Everything but the tombstone and the note is immutable once logged.
    .onConflictDoUpdate({
      target: schema.events.id,
      set: {
        deletedAt: sql`excluded.deleted_at`,
        note: sql`excluded.note`,
        // clock_timestamp rather than now(): distinct per row inside one
        // statement, so a batch cannot collide on the cursor.
        updatedAt: sql`clock_timestamp()`,
      },
    })

  return Response.json({ accepted: rows.map((row) => row.id) })
}
