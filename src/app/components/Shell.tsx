import { useEffect, useRef, useState } from 'react'
import type { Dog, PupEvent } from '@/lib/domain'
import { Deck } from './Deck'
import { SyncDot } from './SyncDot'
import { ThemeToggle } from './ThemeToggle'
import { Timeline } from './Timeline'

type Props = {
  dogs: Dog[]
  events: PupEvent[]
}

/** The signed-in layout. Kept free of data loading so it can be rendered from tests. */
export function Shell({ dogs, events }: Props) {
  // The entry the pencil opened, held here because the timeline starts the edit
  // and the deck is what carries it out.
  const [editing, setEditing] = useState<PupEvent[] | null>(null)

  // Oldest first puts today's last entry at the bottom, which is where the eye
  // should land — and where the deck is. Keyed on the count so a new entry or a
  // sync that brings one down scrolls to it.
  const list = useRef<HTMLElement>(null)
  useEffect(() => {
    const box = list.current
    if (box) box.scrollTop = box.scrollHeight
  }, [events.length])

  return (
    // Three bands filling the viewport exactly: header, timeline, deck. Only the
    // middle one scrolls, and `min-h-0` is what lets it — a flex child will not
    // shrink below its content without it, and the box would grow instead of
    // scrolling. The header and the deck run full width so their backgrounds do
    // too; `max-w-sm` inside each keeps all three on one column.
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0">
        {/* The status bar sits over the wordmark otherwise — the web view
            covers the whole screen. */}
        <div className="mx-auto flex w-full max-w-sm items-center justify-between px-4 pb-1 pt-[calc(1rem+env(safe-area-inset-top))]">
          <h1 className="text-2xl font-extrabold tracking-tight">pupluv</h1>
          <div className="flex items-center gap-3">
            <SyncDot />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-sm px-4 pb-6">
          <Timeline dogs={dogs} events={events} editing={editing} onEdit={setEditing} />
        </div>
      </main>

      <Deck dogs={dogs} events={events} editing={editing} onDone={() => setEditing(null)} />
    </div>
  )
}
