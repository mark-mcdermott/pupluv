import type { APIRoute } from 'astro'
import { auth } from '@/server/auth'

export const prerender = false

/**
 * Every Better Auth route under `/api/auth/*` — sign-up, sign-in, sign-out,
 * get-session and the rest. This replaced a single POST that took a shared PIN
 * and handed back a 90-day token for an account nobody owned.
 */
const handle: APIRoute = ({ request }) => auth().handler(request)

export const GET = handle
export const POST = handle
