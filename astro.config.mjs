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
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
  },
})
