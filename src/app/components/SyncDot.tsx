import { useStore } from '@nanostores/react'
import { $sync } from '../lib/state'

const COPY = {
  idle: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  error: 'Sync failed',
} as const

const DOT = {
  idle: 'bg-moss',
  syncing: 'bg-ink-faint',
  offline: 'bg-ink-faint',
  error: 'bg-clay',
} as const

export function SyncDot() {
  const sync = useStore($sync)
  const label = sync.pending > 0 ? `${sync.pending} waiting` : COPY[sync.status]

  return (
    <p className="flex items-center gap-2 text-xs text-ink-muted" aria-live="polite">
      <span className={`size-1.5 rounded-full ${DOT[sync.status]}`} aria-hidden />
      {label}
    </p>
  )
}
