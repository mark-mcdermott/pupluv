import { useEffect } from 'react'
import { useStore } from '@nanostores/react'
import { Toaster } from '@/components/ui/sonner'
import { Shell } from './components/Shell'
import { SignIn } from './components/SignIn'
import { $authed, $dogs, $events, $ready } from './lib/state'
import { start } from './lib/sync'

export default function App() {
  const ready = useStore($ready)
  const authed = useStore($authed)
  const dogs = useStore($dogs)
  const events = useStore($events)

  useEffect(() => {
    let stop: (() => void) | undefined
    void start().then((teardown) => {
      stop = teardown
    })
    return () => stop?.()
  }, [])

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
      <Shell dogs={dogs} events={events} />
      <Toaster />
    </>
  )
}
