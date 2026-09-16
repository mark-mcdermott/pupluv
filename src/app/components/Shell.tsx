import type { Dog, PupEvent } from '@/lib/domain'
import { DogCard } from './DogCard'
import { BOTH, Deck } from './Deck'
import { SyncDot } from './SyncDot'
import { ThemeToggle } from './ThemeToggle'
import { Timeline } from './Timeline'

type Props = {
  dogs: Dog[]
  events: PupEvent[]
  selectedId: string
  onSelect: (id: string) => void
}

/** The signed-in layout. Kept free of data loading so it can be rendered from tests. */
export function Shell({ dogs, events, selectedId, onSelect }: Props) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between px-4 pb-1 pt-4">
        <h1 className="text-2xl font-extrabold tracking-tight">pupluv</h1>
        <div className="flex items-center gap-3">
          <SyncDot />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 px-4 pb-6">
        <div className="mt-3 grid gap-2">
          {dogs.map((dog) => (
            <DogCard
              key={dog.id}
              dog={dog}
              events={events}
              selected={selectedId === BOTH || dog.id === selectedId}
            />
          ))}
        </div>

        <Timeline dogs={dogs} events={events} />
      </main>

      <Deck dogs={dogs} events={events} selectedId={selectedId} onSelect={onSelect} />
    </div>
  )
}
