import type { APIRoute } from 'astro'
import { asc, eq } from 'drizzle-orm'
import { dogSchema } from '@/lib/domain'
import { isAuthed, unauthorized } from '@/server/auth'
import { getDb, schema } from '@/server/db'

export const prerender = false

export const GET: APIRoute = async ({ request }) => {
  if (!(await isAuthed(request))) return unauthorized()
  const rows = await getDb()
    .select({
      id: schema.dogs.id,
      name: schema.dogs.name,
      accent: schema.dogs.accent,
      emoji: schema.dogs.emoji,
    })
    .from(schema.dogs)
    // id as a tiebreaker: two dogs seeded in one statement share a created_at,
    // and ordering on that alone lets Postgres return them either way round.
    .orderBy(asc(schema.dogs.createdAt), asc(schema.dogs.id))
  return Response.json({ dogs: rows })
}

const renameSchema = dogSchema.pick({ id: true, name: true })

export const PATCH: APIRoute = async ({ request }) => {
  if (!(await isAuthed(request))) return unauthorized()
  const parsed = renameSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid dog' }, { status: 400 })

  const [dog] = await getDb()
    .update(schema.dogs)
    .set({ name: parsed.data.name })
    .where(eq(schema.dogs.id, parsed.data.id))
    .returning({
      id: schema.dogs.id,
      name: schema.dogs.name,
      accent: schema.dogs.accent,
      emoji: schema.dogs.emoji,
    })

  if (!dog) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ dog })
}
