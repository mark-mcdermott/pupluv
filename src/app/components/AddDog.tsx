import { useState } from 'react'
import { toast } from 'sonner'
import { ACCENTS, DOG_EMOJI, type Dog } from '@/lib/domain'
import { accentColor } from '../lib/accent'
import { tapped } from '../lib/feedback'
import { addDog } from '../lib/sync'
import { Glyph } from './Place'

type Props = {
  dogs: Dog[]
  onDone?: () => void
}

/**
 * How a dog comes to exist. Before accounts this was a seed script with two
 * names baked into it, which worked exactly once and only for me.
 *
 * Doubles as the empty state: a new account has nobody to track, and there is
 * nothing else it could usefully show.
 */
export function AddDog({ dogs, onDone }: Props) {
  const [name, setName] = useState('')
  // Taken in order, so the second dog never lands on the first one's colour.
  const [emoji, setEmoji] = useState<string>(DOG_EMOJI[dogs.length % DOG_EMOJI.length]!)
  const [busy, setBusy] = useState(false)

  const first = dogs.length === 0
  const ready = name.trim().length > 0 && !busy

  async function submit() {
    if (!ready) return
    tapped()
    setBusy(true)
    try {
      await addDog({
        name: name.trim(),
        emoji,
        accent: ACCENTS[dogs.length % ACCENTS.length]!,
      })
      setName('')
      onDone?.()
    } catch {
      toast('Could not add them. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-sm flex-col justify-center gap-7 overflow-y-auto px-6 py-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {first ? 'Who are we tracking?' : 'Add another'}
        </h1>
        <p className="mt-2 text-ink-muted">
          {first
            ? 'One dog is enough to start. You can add more whenever.'
            : 'They will show up beside the others.'}
        </p>
      </div>

      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          autoFocus
          placeholder="Their name"
          aria-label="Their name"
          className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none placeholder:text-ink-faint focus-visible:border-ink"
        />

        <div className="grid gap-2" role="radiogroup" aria-label="Pick a picture">
          <div className="grid grid-cols-6 gap-2">
            {DOG_EMOJI.map((option) => {
              const on = option === emoji
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={option}
                  onClick={() => setEmoji(option)}
                  className="press grid h-12 place-items-center rounded-2xl border"
                  style={{
                    borderColor: on ? 'transparent' : 'var(--color-line)',
                    background: on ? accentColor(ACCENTS[dogs.length % ACCENTS.length]!) : 'transparent',
                  }}
                >
                  <Glyph text={option} label={option} size={22} />
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={!ready}
          className="press h-14 rounded-2xl bg-ink text-lg font-bold text-ground disabled:opacity-40"
        >
          {busy ? 'One moment…' : first ? 'Start tracking' : 'Add them'}
        </button>
      </form>

      {first ? null : (
        <button type="button" onClick={onDone} className="press text-sm text-ink-muted hover:text-ink">
          Not now
        </button>
      )}
    </main>
  )
}
