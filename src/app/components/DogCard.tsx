import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_LOCATION,
  LOCATION_LABELS,
  latestLocationEvent,
  tallyPotty,
  type Dog,
  type PupEvent,
} from '@/lib/domain'
import { accentColor } from '../lib/accent'
import { renameDog } from '../lib/sync'
import { daysAgo, sinceLabel } from '../lib/time'

type Props = { dog: Dog; events: PupEvent[]; selected: boolean }

export function DogCard({ dog, events, selected }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(dog.name)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(dog.name), [dog.name])
  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const accent = accentColor(dog.accent)
  const placed = latestLocationEvent(events, dog.id)
  const week = tallyPotty(events, dog.id, daysAgo(7))
  const outsideShare = week.total ? Math.round((week.outside / week.total) * 100) : 0

  async function commit() {
    setEditing(false)
    const name = draft.trim()
    if (!name || name === dog.name) {
      setDraft(dog.name)
      return
    }
    try {
      await renameDog(dog.id, name)
    } catch {
      setDraft(dog.name)
    }
  }

  return (
    <article
      className="rounded-3xl border bg-surface p-4"
      style={{ borderColor: selected ? accent : 'var(--color-line)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        {editing ? (
          <input
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void commit()
              if (event.key === 'Escape') {
                setDraft(dog.name)
                setEditing(false)
              }
            }}
            aria-label="Dog name"
            className="min-w-0 flex-1 border-b border-line bg-transparent text-xl font-bold outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Rename"
            className="truncate text-xl font-bold"
            style={{ color: accent }}
          >
            {dog.name}
          </button>
        )}

        <span className="shrink-0 text-sm text-ink-muted">
          {placed ? sinceLabel(placed.occurredAt) : 'not set'}
        </span>
      </div>

      <p className="mt-0.5 text-ink-muted">
        {LOCATION_LABELS[placed?.location ?? DEFAULT_LOCATION]}
      </p>

      {week.total ? (
        <div className="mt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-sunk"
            role="img"
            aria-label={`${week.outside} of ${week.total} outside over the last 7 days`}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${outsideShare}%`, background: accent }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            {week.outside} of {week.total} outside this week
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-faint">Nothing logged in the last 7 days</p>
      )}
    </article>
  )
}
