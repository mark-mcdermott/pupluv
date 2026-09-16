import { eventSchema, type Dog, type PupEvent } from '@/lib/domain'

/**
 * The home-screen widget is a separate process with no sight of this web view's
 * storage, so anything it needs is handed across an App Group by the native
 * plugin. On the web the plugin is absent and every call here is a no-op.
 */
type SharedStore = {
  publish(options: {
    token?: string
    apiBase?: string
    dogs?: Dog[]
    placements?: Record<string, string>
  }): Promise<void>
  takeOutbox(): Promise<{ events: unknown[] }>
}

function store(): SharedStore | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
    ?.Plugins
  return (plugins?.SharedStore as SharedStore | undefined) ?? null
}

export const isNative = () => store() !== null

/** Tells the widget who we are and where the dogs stand. */
export async function publishToWidget(options: {
  token: string | null
  apiBase: string
  dogs: Dog[]
  placements: Record<string, string>
}): Promise<void> {
  const shared = store()
  if (!shared) return
  try {
    await shared.publish({
      token: options.token ?? undefined,
      apiBase: options.apiBase,
      dogs: options.dogs,
      placements: options.placements,
    })
  } catch {
    // The widget simply shows stale state; nothing here is worth failing a sync.
  }
}

/**
 * Takes anything the widget queued while offline. It is handed over rather than
 * copied, so there is only ever one outbox retrying — this one.
 */
export async function takeWidgetEvents(): Promise<PupEvent[]> {
  const shared = store()
  if (!shared) return []
  try {
    const { events } = await shared.takeOutbox()
    return events
      .map((event) => eventSchema.safeParse(event))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data)
  } catch {
    return []
  }
}
