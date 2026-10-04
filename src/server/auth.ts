import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'
import { getDb, schema } from './db'
import { requireEnv } from './env'

/**
 * The origins a bundled build calls the API from. The phone serves its bundle
 * from `capacitor://localhost` and the Mac app from `tauri://localhost`, so
 * every one of their requests is cross-origin. Better Auth has to trust them to
 * sign in at all, and `src/middleware.ts` answers their CORS preflights — the
 * two lists have to agree, which `src/middleware.test.ts` checks.
 */
export const NATIVE_ORIGINS = [
  'capacitor://localhost',
  'ionic://localhost',
  'tauri://localhost',
  'http://tauri.localhost',
] as const

/** Where the deployed site is served from. Both, because the apex redirects. */
const PRODUCTION_ORIGINS = ['https://www.pupluv.online', 'https://pupluv.online']

function trustedOrigins(): string[] {
  // Named rather than left to Better Auth's inference from the request. The
  // failure it guards against is silent and total: an origin it does not trust
  // cannot sign in at all, and the only place that shows is production.
  const origins: string[] = [...NATIVE_ORIGINS, ...PRODUCTION_ORIGINS, 'http://localhost:4321']
  // Vercel's per-deploy hosts, so a preview can sign in without configuration.
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) origins.push(`https://${host}`)
  }
  return origins
}

/**
 * Built per request rather than at module load: `getDb()` throws when
 * DATABASE_URL is missing, and the build evaluates top-level code before Vercel
 * has injected anything. The same reason the db client is lazy.
 */
let instance: ReturnType<typeof build> | null = null

function build() {
  return betterAuth({
    appName: 'pupluv',
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.PUBLIC_APP_URL ?? undefined,
    secret: requireEnv('AUTH_SECRET'),
    trustedOrigins: trustedOrigins(),

    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: {
        users: schema.users,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),

    user: { modelName: 'users' },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Nothing sends mail yet, so requiring it would lock everyone out of
      // their own account the moment they signed up.
      requireEmailVerification: false,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 90,
      updateAge: 60 * 60 * 24,
    },

    rateLimit: { enabled: process.env.NODE_ENV === 'production' },

    // The rest of the schema is uuid; this keeps the auth tables' text ids
    // holding uuids too rather than Better Auth's own shorter format.
    advanced: { database: { generateId: () => crypto.randomUUID() } },

    /**
     * What a bundled build authenticates with. Sign-in answers with
     * `set-auth-token`, and `Authorization: Bearer <it>` resolves the session on
     * every later call — the browser keeps to its cookie and ignores the header.
     */
    plugins: [bearer()],
  })
}

export function auth(): ReturnType<typeof build> {
  if (!instance) instance = build()
  return instance
}

export type SessionUser = { id: string; email: string; name: string | null }

/** The signed-in user, or null. The only way any route learns who is asking. */
export async function currentUser(request: Request): Promise<SessionUser | null> {
  const result = await auth().api.getSession({ headers: request.headers })
  if (!result?.user) return null
  return { id: result.user.id, email: result.user.email, name: result.user.name ?? null }
}

export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 })
}
