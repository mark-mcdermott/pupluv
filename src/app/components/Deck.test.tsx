import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventSchema, type Dog, type PupEvent } from '@/lib/domain'
import { Deck } from './Deck'

const log = vi.fn(async (event) => ({ ...event, id: 'new', deletedAt: null }))

vi.mock('../lib/sync', () => ({
  log: (event: unknown) => log(event),
  undo: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: vi.fn() }))

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

function setup(events: PupEvent[] = []) {
  return render(<Deck dogs={DOGS} events={events} selectedId={DOG_A} onSelect={vi.fn()} />)
}

beforeEach(() => {
  log.mockClear()
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
