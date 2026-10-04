import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignIn } from './SignIn'
import { SignInFailed } from '../lib/errors'

// vi.hoisted: the mock factory is lifted above ordinary consts, so the spies
// have to be created there too.
const { signIn, signUp } = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }))
vi.mock('../lib/sync', () => ({ signIn, signUp }))

const EMAIL = 'mark@example.com'

async function logIn(password = 'correct-horse') {
  render(<SignIn />)
  await userEvent.type(screen.getByLabelText('Email'), EMAIL)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

async function join(password = 'correct-horse') {
  render(<SignIn />)
  await userEvent.click(screen.getByRole('button', { name: 'Create one' }))
  await userEvent.type(screen.getByLabelText('Your name'), 'Mark')
  await userEvent.type(screen.getByLabelText('Email'), EMAIL)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

const rejects = (mock: typeof signIn, reason: ConstructorParameters<typeof SignInFailed>[0]) =>
  mock.mockImplementation(async () => {
    throw new SignInFailed(reason)
  })

// Braces matter: a function returned from beforeEach is taken as a teardown
// callback, and a mock is callable — vitest would invoke it after every test.
beforeEach(() => {
  signIn.mockReset()
  signUp.mockReset()
})

describe('SignIn', () => {
  it('signs in with what was typed, trimmed', async () => {
    signIn.mockResolvedValue(undefined)
    render(<SignIn />)
    await userEvent.type(screen.getByLabelText('Email'), `  ${EMAIL}  `)
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(signIn).toHaveBeenCalledWith(EMAIL, 'correct-horse')
  })

  it('will not submit until both fields have something in them', async () => {
    render(<SignIn />)
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Email'), EMAIL)
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled()
  })

  it('blames the credentials only when the server refused them', async () => {
    rejects(signIn, 'credentials')
    await logIn()
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match')
  })

  it('says it could not reach the server when the request never landed', async () => {
    rejects(signIn, 'offline')
    await logIn()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Cannot reach pupluv')
    expect(alert).not.toHaveTextContent('do not match')
    // A network failure is not the user's typing — keep what they entered.
    expect(screen.getByLabelText('Password')).toHaveValue('correct-horse')
  })

  it('clears the password but never the address', async () => {
    rejects(signIn, 'credentials')
    await logIn()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue(EMAIL)
  })

  it('reports a server fault distinctly from a refusal', async () => {
    rejects(signIn, 'server')
    await logIn()
    expect(await screen.findByRole('alert')).toHaveTextContent('having trouble')
  })

  it('signs up with a name, and asks for one first', async () => {
    signUp.mockResolvedValue(undefined)
    render(<SignIn />)
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create one' }))
    expect(screen.getByLabelText('Your name')).toBeInTheDocument()
  })

  it('sends the sign-up to signUp, not signIn', async () => {
    signUp.mockResolvedValue(undefined)
    await join()
    expect(signUp).toHaveBeenCalledWith(EMAIL, 'correct-horse', 'Mark')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('drops back to logging in when the address is already taken', async () => {
    rejects(signUp, 'taken')
    await join()
    expect(await screen.findByRole('alert')).toHaveTextContent('already an account')
    // The next thing they want is the log-in form, already showing.
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
  })

  it('says how long a password has to be rather than just refusing it', async () => {
    rejects(signUp, 'weak')
    await join('short')
    expect(await screen.findByRole('alert')).toHaveTextContent('8 characters')
  })
})
