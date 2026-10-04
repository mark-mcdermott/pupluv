import type { APIRoute } from 'astro'
import { and, asc, eq, getTableColumns, gt, inArray, sql } from 'drizzle-orm'
import { eventBatchSchema } from '@/lib/domain'
import { currentUser, unauthorized } from '@/server/auth'
import { getDb, schema } from '@/server/db'
import { fromRow, toRow } from '@/server/events'

export const prerender = false

const PAGE_SIZE = 500

/** Pull: everything the server *changed* after the client's cursor — not just
 *  what it created, or edits and deletes would never reach another device. */
export const GET: APIRoute = async ({ request, url }) => {
  const user = await currentUser(request)
  if (!user) return unauthorized()

  const since = url.searchParams.get('since')
  const sinceDate = since ? new Date(since) : null
  if (sinceDate && Number.isNaN(sinceDate.valueOf())) {
    return Response.json({ error: 'invalid cursor' }, { status: 400 })
  }

  // Joined rather than filtered on the events table: an event is owned through
  // the dog it belongs to, and there is no owner column on it to go stale.
  const rows = await getDb()
    .select(getTableColumns(schema.events))
    .from(schema.events)
    .innerJoin(schema.dogs, eq(schema.dogs.id, schema.events.dogId))
    .where(
      and(
        eq(schema.dogs.userId, user.id),
        sinceDate ? gt(schema.events.updatedAt, sinceDate) : undefined,
      ),
    )
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
  const user = await currentUser(request)
  if (!user) return unauthorized()

  const parsed = eventBatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'invalid events', issues: parsed.error.issues }, { status: 400 })
  }

  // A foreign-key violation would surface as a 500, which the client treats as
  // transient and retries forever. An unknown dog is the client's mistake, so
  // say so with a 400 and let it drop the batch.
  //
  // The same query is what stops one account writing to another's dog: somebody
  // else's id is simply not among the rows this returns, so it reads as unknown.
  // There is no separate authorisation step to forget.
  const db = getDb()
  const dogIds = [...new Set(parsed.data.map((event) => event.dogId))]
  const known = await db
    .select({ id: schema.dogs.id })
    .from(schema.dogs)
    .where(and(inArray(schema.dogs.id, dogIds), eq(schema.dogs.userId, user.id)))
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
