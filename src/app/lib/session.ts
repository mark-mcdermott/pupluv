const TOKEN_KEY = 'pupluv:token'
const CURSOR_KEY = 'pupluv:cursor'
const OUTBOX_KEY = 'pupluv:outbox'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode — the app still works, it just re-authenticates next launch */
  }
}

export const getToken = () => read(TOKEN_KEY)
export const setToken = (token: string | null) => write(TOKEN_KEY, token)

export const getCursor = () => read(CURSOR_KEY)
export const setCursor = (cursor: string | null) => write(CURSOR_KEY, cursor)

/** Ids of events logged on this device that the server has not acknowledged. */
export function getOutbox(): string[] {
  const raw = read(OUTBOX_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function setOutbox(ids: string[]): void {
  write(OUTBOX_KEY, ids.length ? JSON.stringify(ids) : null)
}

export function clearSession(): void {
  write(TOKEN_KEY, null)
  write(CURSOR_KEY, null)
  write(OUTBOX_KEY, null)
}
