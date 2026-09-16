import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignIn } from './SignIn'
import { SignInFailed } from '../lib/errors'

// vi.hoisted: the mock factory is lifted above ordinary consts, so the spy has
// to be created there too.
const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }))
vi.mock('../lib/sync', () => ({ signIn }))

async function attempt(pin = '823125') {
  render(<SignIn />)
  await userEvent.type(screen.getByLabelText('PIN'), pin)
  await userEvent.click(screen.getByRole('button', { name: 'Unlock' }))
}

// Braces matter: a function returned from beforeEach is taken as a teardown
// callback, and a mock is callable — vitest would invoke it after every test.
beforeEach(() => {
  signIn.mockReset()
})

describe('SignIn', () => {
  it('blames the PIN only when the server rejected the PIN', async () => {
    signIn.mockImplementation(async () => {
      throw new SignInFailed('pin')
    })
    await attempt()
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match')
  })

  it('says it could not reach the server when the request never landed', async () => {
    signIn.mockImplementation(async () => {
      throw new SignInFailed('offline')
    })
    await attempt()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Cannot reach pupluv')
    expect(alert).not.toHaveTextContent('does not match')
    // A network failure is not the user's typing — keep what they entered.
    expect(screen.getByLabelText('PIN')).toHaveValue('823125')
  })

  it('clears the field only for a genuinely wrong PIN', async () => {
    signIn.mockImplementation(async () => {
      throw new SignInFailed('pin')
    })
    await attempt()
    expect(screen.getByLabelText('PIN')).toHaveValue('')
  })

  it('reports a server fault distinctly from a bad PIN', async () => {
    signIn.mockImplementation(async () => {
      throw new SignInFailed('server')
    })
    await attempt()
    expect(await screen.findByRole('alert')).toHaveTextContent('having trouble')
  })
})
