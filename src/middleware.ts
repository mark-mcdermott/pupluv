import { defineMiddleware } from 'astro:middleware'

// The bundled iOS build serves the UI from capacitor://localhost and calls the
// deployed API cross-origin. Auth is a bearer token, not a cookie, so an origin
// allowlist is all that is needed here — no credentialed requests.
const ALLOWED_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost'])

function isAllowed(origin: string | null): origin is string {
  if (!origin) return false
  if (ALLOWED_ORIGINS.has(origin)) return true
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith('/api/')) return next()

  const origin = context.request.headers.get('origin')
  const cors: Record<string, string> = isAllowed(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
        'access-control-max-age': '86400',
        vary: 'origin',
      }
    : {}

  if (context.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const response = await next()
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value)
  return response
})
