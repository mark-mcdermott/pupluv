import { createAuthClient } from 'better-auth/react'
import { API_BASE } from './api'
import { getToken, setToken } from './session'

/**
 * Better Auth's browser client.
 *
 * The token is kept and sent on every surface, not just the native ones. A
 * cookie would work in a browser and nowhere else — the bundled builds call the
 * API from `capacitor://localhost` and `tauri://localhost`, cross-origin, where
 * cookies are a fight — and the whole point of the bearer plugin here is that
 * one code path covers all three. `set-auth-token` comes back on sign-in and
 * sign-up; `Authorization: Bearer` resolves it on everything after.
 */
export const authClient = createAuthClient({
  baseURL: API_BASE || undefined,
  fetchOptions: {
    auth: { type: 'Bearer', token: () => getToken() ?? '' },
    onSuccess: (context) => {
      const token = context.response.headers.get('set-auth-token')
      if (token) setToken(token)
    },
  },
})
