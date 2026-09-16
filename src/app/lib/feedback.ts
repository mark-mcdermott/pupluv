/**
 * A logging tap should be felt, not just seen — you are often not looking at the
 * screen. Capacitor's haptics engine is used on device when it is present;
 * elsewhere this is a no-op rather than a dependency.
 */
type HapticsApi = { impact: (options: { style: string }) => Promise<void> }

function haptics(): HapticsApi | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
    ?.Plugins
  return (plugins?.Haptics as HapticsApi | undefined) ?? null
}

export function tapped(): void {
  void haptics()?.impact({ style: 'MEDIUM' }).catch(() => {})
}
