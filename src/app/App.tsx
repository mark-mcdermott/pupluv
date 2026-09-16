import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Toaster } from '@/components/ui/sonner'
import { BOTH } from './components/Deck'
import { Shell } from './components/Shell'
import { SignIn } from './components/SignIn'
import { $authed, $dogs, $events, $ready } from './lib/state'
import { start } from './lib/sync'

const SELECTED_KEY = 'pupluv:dog'

export default function App() {
  const ready = useStore($ready)
  const authed = useStore($authed)
  const dogs = useStore($dogs)
  const events = useStore($events)

  const [selectedId, setSelectedId] = useState<string>(() => {
    try {
      return localStorage.getItem(SELECTED_KEY) ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    let stop: (() => void) | undefined
    void start().then((teardown) => {
      stop = teardown
    })
    return () => stop?.()
  }, [])

  // Most entries cover both dogs at once, so that is where a fresh install starts.
  useEffect(() => {
    if (selectedId || !dogs.length) return
    setSelectedId(dogs.length > 1 ? BOTH : dogs[0]!.id)
  }, [dogs, selectedId])

  function select(id: string) {
    setSelectedId(id)
    try {
      localStorage.setItem(SELECTED_KEY, id)
    } catch {
      /* the choice just won't persist */
    }
  }

  if (!ready) {
    return <div className="grid min-h-dvh place-items-center text-ink-faint">Loading…</div>
  }

  if (!authed) {
    return (
      <>
        <SignIn />
        <Toaster />
      </>
    )
  }

  return (
    <>
      <Shell dogs={dogs} events={events} selectedId={selectedId} onSelect={select} />
      <Toaster />
    </>
  )
}
