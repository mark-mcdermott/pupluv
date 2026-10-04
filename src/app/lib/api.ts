/**
 * Where the API lives, normalised.
 *
 * Its own module rather than a corner of `sync.ts` because the auth client
 * needs it too, and importing it from there would be a cycle: sync signs in
 * through the auth client, and the auth client would be asking sync where to go.
 *
 * A trailing slash is the specific thing being guarded against. `https://host/`
 * makes every path `https://host//api/...`, which Vercel answers with a 308. A
 * cross-origin POST does not survive that redirect — it carries no CORS headers
 * — so the app would report itself unreachable because of one character in an
 * env var. Normalise instead of trusting it.
 */
export function apiBase(configured: string | undefined): string {
  return (configured ?? '').trim().replace(/\/+$/, '')
}

/**
 * Same-origin on the web. The bundled builds are served from
 * `capacitor://localhost` and `tauri://localhost`, so they are given the
 * deployed origin at build time.
 */
export const API_BASE = apiBase(import.meta.env.PUBLIC_API_URL)
