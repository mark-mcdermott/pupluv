import { afterEach, describe, expect, it, vi } from 'vitest'
import { eventSchema } from '@/lib/domain'
import { isNative, publishToWidget, takeWidgetEvents } from './native'

const EVENT = eventSchema.parse({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  dogId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  type: 'location',
  occurredAt: '2026-09-16T10:00:00.000Z',
  location: 'outside',
})

function install(plugin: Record<string, unknown>) {
  vi.stubGlobal('Capacitor', { Plugins: { SharedStore: plugin } })
}

afterEach(() => vi.unstubAllGlobals())

describe('the widget bridge', () => {
  it('is inert on the web, where the plugin does not exist', async () => {
    expect(isNative()).toBe(false)
    await expect(
      publishToWidget({ token: 't', apiBase: '', dogs: [], placements: {} }),
    ).resolves.toBeUndefined()
    await expect(takeWidgetEvents()).resolves.toEqual([])
  })

  it('hands the native side what the widget needs', async () => {
    const publish = vi.fn(async () => {})
    install({ publish, takeOutbox: async () => ({ events: [] }) })

    await publishToWidget({
      token: 'tok',
      apiBase: 'https://pupluv.vercel.app',
      dogs: [{ id: 'd1', name: 'Oreo', accent: 'amber', emoji: '🍪' }],
      placements: { d1: 'outside' },
    })

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok', placements: { d1: 'outside' } }),
    )
  })

  it('sends undefined rather than null when signed out', async () => {
    const publish = vi.fn(async (_options: { token?: string }) => {})
    install({ publish, takeOutbox: async () => ({ events: [] }) })
    await publishToWidget({ token: null, apiBase: '', dogs: [], placements: {} })
    expect(publish.mock.calls[0]![0].token).toBeUndefined()
  })

  it('adopts queued widget events, discarding anything malformed', async () => {
    install({
      publish: async () => {},
      takeOutbox: async () => ({ events: [EVENT, { id: 'nonsense' }] }),
    })
    await expect(takeWidgetEvents()).resolves.toEqual([EVENT])
  })

  it('never lets a native failure break a sync', async () => {
    install({
      publish: async () => {
        throw new Error('bridge died')
      },
      takeOutbox: async () => {
        throw new Error('bridge died')
      },
    })
    await expect(
      publishToWidget({ token: 't', apiBase: '', dogs: [], placements: {} }),
    ).resolves.toBeUndefined()
    await expect(takeWidgetEvents()).resolves.toEqual([])
  })
})
