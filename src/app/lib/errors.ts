/**
 * Why a sign-in failed. Kept in its own module so a component — or a test — can
 * name the reason without pulling in the whole sync engine.
 */
export type SignInReason = 'pin' | 'offline' | 'server'

export class SignInFailed extends Error {
  constructor(readonly reason: SignInReason) {
    super(reason)
    this.name = 'SignInFailed'
  }
}
