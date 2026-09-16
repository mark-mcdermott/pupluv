import type { CapacitorConfig } from '@capacitor/cli'

// Local-first: the webview ships the built app rather than pointing at the
// deployed origin, so logging works with no signal. Only the sync calls need the
// network, and they are aimed at PUBLIC_API_URL, baked in at build time.
const config: CapacitorConfig = {
  appId: 'com.pupluv.app',
  appName: 'pupluv',
  // `astro build` with the Vercel adapter leaves the static output in dist/client.
  webDir: 'dist/client',
  ios: { contentInset: 'always' },
}

export default config
