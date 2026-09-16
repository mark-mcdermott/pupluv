import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Lazily constructed: `neon()` throws on a missing DATABASE_URL, and the build
// evaluates module top-level code before Vercel has injected the env vars.
// A plain function, not a Proxy — Proxy wrappers break libraries that inspect
// the client object.
let client: ReturnType<typeof create> | null = null

function create() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(neon(url), { schema })
}

export function getDb() {
  if (!client) client = create()
  return client
}

export { schema }
