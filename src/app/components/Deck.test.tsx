import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventSchema, type Dog, type PupEvent } from '@/lib/domain'
import { BOTH, Deck } from './Deck'

const { log, undo, toast } = vi.hoisted(() => ({
  log: vi.fn(),
  undo: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../lib/sync', () => ({ log, undo }))
vi.mock('sonner', () => ({ toast }))

const DOG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const DOGS: Dog[] = [
  { id: DOG_A, name: 'Rex', accent: 'amber' },
  { id: DOG_B, name: 'Luna', accent: 'teal' },
]

const outside: PupEvent = eventSchema.parse({
  id: '55555555-5555-4555-8555-555555555555',
  dogId: DOG_A,
  type: 'location',
  occurredAt: '2026-09-16T10:00:00.000Z',
  location: 'outside',
})

function setup(events: PupEvent[] = [], selectedId: string = DOG_A) {
  return render(<Deck dogs={DOGS} events={events} selectedId={selectedId} onSelect={vi.fn()} />)
}

const inside: PupEvent = eventSchema.parse({
  id: '66666666-6666-4666-8666-666666666666',
  dogId: DOG_B,
  type: 'location',
  occurredAt: '2026-09-16T10:00:00.000Z',
  location: 'inside',
})

let minted = 0

beforeEach(() => {
  minted = 0
  log.mockReset()
  undo.mockReset()
  toast.mockReset()
  log.mockImplementation(async (event: Record<string, unknown>) => ({
    ...event,
    id: `event-${++minted}`,
    deletedAt: null,
  }))
})

describe('Deck', () => {
  it('files a potty event at the location the dog is currently in', async () => {
    setup([outside])
    await userEvent.click(screen.getByRole('button', { name: 'Poo' }))

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'potty', pottyKind: 'poo', location: 'outside', dogId: DOG_A }),
    )
  })

  it('falls back to inside when the dog has never been placed', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Pee' }))

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ location: 'inside' }))
    // and says so, rather than filing it silently
    expect(screen.getByRole('radio', { name: 'Inside' })).toBeChecked()
  })

  it('shows where the dog is so a one-tap log is never a guess', () => {
    setup([outside])
    expect(screen.getByRole('radio', { name: 'Outside' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Inside' })).not.toBeChecked()
  })

  it('does not log a move to the location the dog is already in', async () => {
    setup([outside])
    await userEvent.click(screen.getByRole('radio', { name: 'Outside' }))
    expect(log).not.toHaveBeenCalled()
  })

  it('records a move to a new location', async () => {
    setup([outside])
    await userEvent.click(screen.getByRole('radio', { name: 'Pen' }))
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'location', location: 'pen', dogId: DOG_A }),
    )
  })
})

describe('Deck with both dogs selected', () => {
  it('logs one event per dog from a single tap', async () => {
    setup([outside, inside], BOTH)
    await userEvent.click(screen.getByRole('button', { name: 'Poo' }))

    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls.map(([event]) => event.dogId)).toEqual([DOG_A, DOG_B])
  })

  it('files each dog at its own location when they are apart', async () => {
    setup([outside, inside], BOTH)
    await userEvent.click(screen.getByRole('button', { name: 'Pee' }))

    const byDog = Object.fromEntries(
      log.mock.calls.map(([event]) => [event.dogId, event.location]),
    )
    expect(byDog).toEqual({ [DOG_A]: 'outside', [DOG_B]: 'inside' })
  })

  it('stamps the batch with one timestamp so the entries line up', async () => {
    setup([outside, inside], BOTH)
    await userEvent.click(screen.getByRole('button', { name: 'Pee + Poo' }))

    const [first, second] = log.mock.calls.map(([event]) => event.occurredAt)
    expect(first).toBe(second)
  })

  it('lights no location while the dogs are in different places', () => {
    setup([outside, inside], BOTH)
    for (const name of ['Pen', 'Outside', 'Inside']) {
      expect(screen.getByRole('radio', { name })).not.toBeChecked()
    }
  })

  it('lights the shared location once they are together', () => {
    const bothOutside = eventSchema.parse({
      id: '77777777-7777-4777-8777-777777777777',
      dogId: DOG_B,
      type: 'location',
      occurredAt: '2026-09-16T10:00:00.000Z',
      location: 'outside',
    })
    setup([outside, bothOutside], BOTH)
    expect(screen.getByRole('radio', { name: 'Outside' })).toBeChecked()
  })

  it('only moves the dog that is not already there', async () => {
    setup([outside, inside], BOTH)
    await userEvent.click(screen.getByRole('radio', { name: 'Outside' }))

    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toMatchObject({ dogId: DOG_B, location: 'outside' })
  })

  it('undoes every event the batch created', async () => {
    setup([outside, inside], BOTH)
    await userEvent.click(screen.getByRole('button', { name: 'Pee' }))

    const [, options] = toast.mock.calls[0]!
    options.action.onClick()

    expect(undo).toHaveBeenCalledTimes(2)
    expect(undo.mock.calls.flat()).toEqual(['event-1', 'event-2'])
  })
})
