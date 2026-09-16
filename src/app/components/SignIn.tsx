import { useState } from 'react'
import { SignInFailed, type SignInReason } from '../lib/errors'
import { signIn } from '../lib/sync'

const MESSAGES: Record<SignInReason, string> = {
  pin: 'That PIN does not match. Try again.',
  offline: 'Cannot reach pupluv. Check your connection, then try again.',
  server: 'pupluv is having trouble right now. Try again in a moment.',
}

export function SignIn() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await signIn(pin)
    } catch (failure) {
      const reason = failure instanceof SignInFailed ? failure.reason : 'server'
      setError(MESSAGES[reason])
      // Only a genuinely wrong PIN is worth retyping.
      if (reason === 'pin') setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6">
      <div>
        <h1 className="text-5xl font-extrabold tracking-tight">pupluv</h1>
        <p className="mt-2 text-ink-muted">Where they are, and how it is going.</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex flex-col gap-3">
        <label htmlFor="pin" className="text-sm font-medium text-ink-muted">
          PIN
        </label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'pin-error' : undefined}
          className="h-14 rounded-2xl border border-line bg-surface px-4 text-2xl tracking-[0.4em] outline-none focus-visible:border-ink"
        />
        {error ? (
          <p id="pin-error" role="alert" className="text-sm text-clay">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || pin.length < 6}
          className="press h-14 rounded-2xl bg-ink text-lg font-semibold text-ground disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </main>
  )
}
