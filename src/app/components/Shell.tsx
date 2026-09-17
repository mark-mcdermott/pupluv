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
  return (
    // The deck sits outside the column so its background can run full width;
    // `max-w-sm` is repeated there to keep its buttons on the same grid.
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-4">
        <header className="flex items-center justify-between pb-1 pt-4">
          <h1 className="text-2xl font-extrabold tracking-tight">pupluv</h1>
          <div className="flex items-center gap-3">
            <SyncDot />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 pb-6">
          <Timeline dogs={dogs} events={events} />
        </main>
      </div>

      <Deck dogs={dogs} events={events} />
    </div>
  )
}
