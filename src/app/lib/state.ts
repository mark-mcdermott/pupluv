import { atom, map } from 'nanostores'
import type { Dog, PupEvent } from '@/lib/domain'

export const $events = atom<PupEvent[]>([])
export const $dogs = atom<Dog[]>([])
export const $authed = atom(false)
export const $ready = atom(false)

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

export const $sync = map<{ status: SyncStatus; pending: number; lastSyncedAt: string | null }>({
  status: 'idle',
  pending: 0,
  lastSyncedAt: null,
})
