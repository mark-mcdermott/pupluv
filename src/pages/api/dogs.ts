import type { APIRoute } from 'astro'
import { and, asc, eq } from 'drizzle-orm'
import { dogSchema } from '@/lib/domain'
import { currentUser, unauthorized } from '@/server/auth'
import { getDb, schema } from '@/server/db'

export const prerender = false

const FIELDS = {
  id: schema.dogs.id,
  name: schema.dogs.name,
  accent: schema.dogs.accent,
  emoji: schema.dogs.emoji,
}

/** Only ever this user's dogs. Everything else keys off the ids this returns. */
export const GET: APIRoute = async ({ request }) => {
  const user = await currentUser(request)
  if (!user) return unauthorized()

  const rows = await getDb()
    .select(FIELDS)
    .from(schema.dogs)
    .where(eq(schema.dogs.userId, user.id))
    // id as a tiebreaker: two dogs created in one statement share a created_at,
    // and ordering on that alone lets Postgres return them either way round.
    .orderBy(asc(schema.dogs.createdAt), asc(schema.dogs.id))
  return Response.json({ dogs: rows })
}

const newDogSchema = dogSchema.omit({ id: true })

/** How a dog comes to exist now. It used to be a seed script with two names in it. */
export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request)
  if (!user) return unauthorized()

  const parsed = newDogSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'invalid dog', issues: parsed.error.issues }, { status: 400 })
  }

  const [dog] = await getDb()
    .insert(schema.dogs)
    .values({ ...parsed.data, userId: user.id })
    .returning(FIELDS)
  return Response.json({ dog }, { status: 201 })
}

const editSchema = dogSchema.pick({ id: true }).merge(dogSchema.omit({ id: true }).partial())

export const PATCH: APIRoute = async ({ request }) => {
  const user = await currentUser(request)
  if (!user) return unauthorized()

  const parsed = editSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid dog' }, { status: 400 })
  const { id, ...changes } = parsed.data
  if (!Object.keys(changes).length) {
    return Response.json({ error: 'nothing to change' }, { status: 400 })
  }

  const [dog] = await getDb()
    .update(schema.dogs)
    .set(changes)
    // The owner check is in the where clause, not a lookup before it: a dog
    // belonging to someone else is indistinguishable from one that is not there.
    .where(and(eq(schema.dogs.id, id), eq(schema.dogs.userId, user.id)))
    .returning(FIELDS)

  if (!dog) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ dog })
}
