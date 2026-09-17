import type { CapacitorConfig } from '@capacitor/cli'

// Local-first: the webview ships the built app rather than pointing at the
// deployed origin, so logging works with no signal. Only the sync calls need the
// network, and they are aimed at PUBLIC_API_URL, baked in at build time.
const config: CapacitorConfig = {
  appId: 'com.pupluv.app',
  appName: 'pupluv',
  // `astro build` with the Vercel adapter leaves the static output in dist/client.
  webDir: 'dist/client',
  // The platform directory is renameable; the App folders inside it are not —
  // Capacitor hardcodes them as nativeProjectDir and nativeTargetDir.
  // never, not always: the web view fills the screen and the layout pads itself
  // out of the status bar and the home indicator with env(safe-area-inset-*).
  // Letting the scroll view inset instead leaves the page offset by that much
  // with nowhere to scroll it back, now that the document itself does not move.
  ios: { path: 'iphone', contentInset: 'never' },
}

export default config
