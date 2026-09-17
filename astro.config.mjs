// @ts-check
import { defineConfig } from 'astro/config'
import { loadEnv } from 'vite'
import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Astro only exposes PUBLIC_* to the client. The API endpoints read DATABASE_URL
// server-side, and under `astro dev` nothing else populates process.env — Vercel
// sets these itself in production, where the absent .env makes this a no-op.
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '')
for (const [key, value] of Object.entries(env)) process.env[key] ??= value

// Static by default: every page prerenders, so the whole UI can be bundled into
// the Capacitor webview. Only `/api/*` opts out via `export const prerender = false`
// and becomes an on-demand Vercel function.
export default defineConfig({
  integrations: [react()],
  adapter: vercel(),
  // The dev toolbar floats over the bottom centre of the viewport, which is
  // exactly where the deck's controls live — it covers "Add details".
  devToolbar: { enabled: false },
  security: {
    // The dev server refuses any request whose Sec-Fetch-Site is cross-site
    // unless its origin is listed here. The native client is cross-origin by
    // construction — it serves the bundle from capacitor://localhost and calls
    // this API — so without these entries `pnpm dev` 403s every sign-in from
    // the simulator while the browser works fine. Production is unaffected:
    // that guard is dev-only, and `checkOrigin` (left on) only rejects
    // cross-origin *form* posts, never this JSON API.
    allowedDomains: [
      { protocol: 'capacitor', hostname: 'localhost' },
      { protocol: 'ionic', hostname: 'localhost' },
      { protocol: 'tauri', hostname: 'localhost' },
    ],
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
  },
})
