import { useState } from 'react'
import { SignInFailed, type SignInReason } from '../lib/errors'
import { signIn, signUp } from '../lib/sync'

const MESSAGES: Record<SignInReason, string> = {
  credentials: 'That email and password do not match. Try again.',
  taken: 'There is already an account with that email. Log in instead.',
  weak: 'Passwords need at least 8 characters.',
  offline: 'Cannot reach pupluv. Check your connection, then try again.',
  server: 'pupluv is having trouble right now. Try again in a moment.',
}

const FIELD =
  'h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none placeholder:text-ink-faint focus-visible:border-ink'

export function SignIn() {
  // One form, two modes. They differ by a single field and which call runs, and
  // splitting them into two screens would mean two of everything below.
  const [joining, setJoining] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ready = email.trim().length > 0 && password.length > 0 && (!joining || name.trim().length > 0)

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      if (joining) await signUp(email.trim(), password, name.trim())
      else await signIn(email.trim(), password)
    } catch (failure) {
      const reason = failure instanceof SignInFailed ? failure.reason : 'server'
      setError(MESSAGES[reason])
      // Only the secret is worth retyping. Making them type the address again
      // after a typo in the password is the kind of thing that reads as broken.
      if (reason === 'credentials' || reason === 'weak') setPassword('')
      if (reason === 'taken') setJoining(false)
    } finally {
      setBusy(false)
    }
  }

  function swap() {
    setJoining(!joining)
    setError(null)
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-sm flex-col justify-center gap-8 overflow-y-auto px-6 py-8">
      <div>
        <h1 className="text-5xl font-extrabold tracking-tight">pupluv</h1>
        <p className="mt-2 text-ink-muted">Where they are, and how it is going.</p>
      </div>

      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {joining ? (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="Your name"
            aria-label="Your name"
            className={FIELD}
          />
        ) : null}

        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="Email"
          aria-label="Email"
          className={FIELD}
        />

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          // The browser only offers to save a new password when it is told one
          // is being created, and only offers the saved one when it is not.
          autoComplete={joining ? 'new-password' : 'current-password'}
          placeholder="Password"
          aria-label="Password"
          className={FIELD}
        />

        {error ? (
          <p role="alert" className="text-sm text-clay">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!ready || busy}
          className="press h-14 rounded-2xl bg-ink text-lg font-bold text-ground disabled:opacity-40"
        >
          {busy ? 'One moment…' : joining ? 'Create account' : 'Log in'}
        </button>
      </form>

      <p className="text-center text-sm text-ink-muted">
        {joining ? 'Already have an account?' : 'New here?'}{' '}
        <button type="button" onClick={swap} className="press font-semibold text-ink underline">
          {joining ? 'Log in' : 'Create one'}
        </button>
      </p>
    </main>
  )
}
