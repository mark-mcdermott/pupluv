import { eq, isNull } from 'drizzle-orm'
import { getDb, schema } from '../src/server/db'

/**
 * Hands the dogs that predate accounts to one.
 *
 * Everything logged before this existed has no owner, and `dogs.user_id` is
 * nullable for exactly as long as that is true. Sign up first, then run this
 * with that address: the dogs become yours, and the events follow because they
 * are owned through the dog rather than carrying an owner of their own.
 *
 *   pnpm db:claim you@example.com
 */
const email = process.argv[2]
if (!email) {
  console.error('usage: pnpm db:claim <email>')
  process.exit(1)
}

const db = getDb()

const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email))
if (!user) {
  console.error(`no account for ${email} — sign up first, then run this`)
  process.exit(1)
}

const orphans = await db.select().from(schema.dogs).where(isNull(schema.dogs.userId))
if (!orphans.length) {
  console.log('nothing to claim: every dog already belongs to somebody')
  process.exit(0)
}

const claimed = await db
  .update(schema.dogs)
  .set({ userId: user.id })
  .where(isNull(schema.dogs.userId))
  .returning({ name: schema.dogs.name })

console.log(`${email} now owns: ${claimed.map((dog) => dog.name).join(', ')}`)
