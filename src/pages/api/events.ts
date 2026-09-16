import type { APIRoute } from 'astro'
import { asc, gt, sql } from 'drizzle-orm'
import { eventBatchSchema } from '@/lib/domain'
import { isAuthed, unauthorized } from '@/server/auth'
import { getDb, schema } from '@/server/db'
import { fromRow, toRow } from '@/server/events'

export const prerender = false

const PAGE_SIZE = 500

/** Pull: everything the server recorded after the client's cursor. */
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
    .where(sinceDate ? gt(schema.events.createdAt, sinceDate) : undefined)
    .orderBy(asc(schema.events.createdAt))
    .limit(PAGE_SIZE)

  return Response.json({
    events: rows.map(fromRow),
    cursor: rows.at(-1)?.createdAt.toISOString() ?? since,
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

  const rows = parsed.data.map(toRow)
  await getDb()
    .insert(schema.events)
    .values(rows)
    // Everything but the tombstone and the note is immutable once logged.
    .onConflictDoUpdate({
      target: schema.events.id,
      set: {
        deletedAt: sql`excluded.deleted_at`,
        note: sql`excluded.note`,
      },
    })

  return Response.json({ accepted: rows.map((row) => row.id) })
}
