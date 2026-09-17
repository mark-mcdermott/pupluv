import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventSchema, type Dog, type PupEvent } from '@/lib/domain'
import { BOTH, Deck } from './Deck'

const { log, undo, toast } = vi.hoisted(() => ({ log: vi.fn(), undo: vi.fn(), toast: vi.fn() }))
vi.mock('../lib/sync', () => ({ log, undo }))
vi.mock('sonner', () => ({ toast }))

const DOG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const DOGS: Dog[] = [
  { id: DOG_A, name: 'Oreo', accent: 'amber', emoji: '🍪' },
  { id: DOG_B, name: 'Ramen', accent: 'teal', emoji: '🍜' },
]

let uid = 0
const placed = (
  dogId: string,
  location: 'pen' | 'outside' | 'inside' | 'crate' | 'bed',
): PupEvent =>
  eventSchema.parse({
    id: `55555555-5555-4555-8555-${String(++uid).padStart(12, '0')}`,
    dogId,
    type: 'location',
    occurredAt: '2026-09-16T10:00:00.000Z',
    location,
  })

const bothOutside = [placed(DOG_A, 'outside'), placed(DOG_B, 'outside')]
const apart = [placed(DOG_A, 'outside'), placed(DOG_B, 'inside')]

function setup(events: PupEvent[] = [], selectedId: string = BOTH) {
  return render(<Deck dogs={DOGS} events={events} selectedId={selectedId} onSelect={vi.fn()} />)
}

const openDetails = () => userEvent.click(screen.getByRole('button', { name: 'Add details' }))

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

describe('Deck closed', () => {
  it('shows only the places plus the fold', () => {
    setup(bothOutside)
    expect(screen.getByRole('button', { name: 'Pen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add details' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log it' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Pee' })).not.toBeInTheDocument()
  })

  it('logs a move for every dog on a single tap', async () => {
    setup(bothOutside)
    await userEvent.click(screen.getByRole('button', { name: 'Pen' }))

    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls.map(([event]) => event.dogId)).toEqual([DOG_A, DOG_B])
    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'location', location: 'pen' })
    }
  })

  it('applies to both dogs even when one is selected', async () => {
    setup(bothOutside, DOG_A)
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }))
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('moves only the dog that is not already there', async () => {
    setup(apart)
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }))

    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toMatchObject({ dogId: DOG_B, location: 'outside' })
  })

  it('does nothing when they are already there', async () => {
    setup(bothOutside)
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }))
    expect(log).not.toHaveBeenCalled()
  })
})

describe('Deck open', () => {
  it('stops logging on tap once it is a form', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(screen.getByRole('radio', { name: 'Pen' }))

    expect(log).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Pen' })).toBeChecked()
  })

  it('will not submit with nothing to record', async () => {
    setup(bothOutside)
    await openDetails()
    expect(screen.getByRole('button', { name: 'Log it' })).toBeDisabled()
  })

  it('keeps the potty choices exclusive', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(screen.getByRole('radio', { name: 'Pee' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Pee + Poo' }))

    expect(screen.getByRole('radio', { name: 'Pee + Poo' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Pee' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Poo' })).not.toBeChecked()
  })

  it('writes nothing until Log it is pressed', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(screen.getByRole('radio', { name: 'Poo' }))
    expect(log).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Log it' }))
    expect(log).toHaveBeenCalledTimes(2)
    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'potty', pottyKind: 'poo', location: 'outside' })
    }
  })

  it('files each dog at its own place when no place is chosen', async () => {
    setup(apart)
    await openDetails()
    await userEvent.click(screen.getByRole('radio', { name: 'Pee' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log it' }))

    const byDog = Object.fromEntries(log.mock.calls.map(([e]) => [e.dogId, e.location]))
    expect(byDog).toEqual({ [DOG_A]: 'outside', [DOG_B]: 'inside' })
  })

  it('records the move alongside the potty when the place changed', async () => {
    setup(bothOutside, DOG_A)
    await openDetails()
    await userEvent.click(screen.getByRole('radio', { name: 'Pee' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Inside' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log it' }))

    const types = log.mock.calls.map(([e]) => e.type)
    expect(types).toEqual(['potty', 'location'])
    expect(log.mock.calls[0]![0]).toMatchObject({ dogId: DOG_A, location: 'inside' })
  })

  it('attaches a note and clears it after submitting', async () => {
    setup(bothOutside, DOG_A)
    await openDetails()
    await userEvent.click(screen.getByRole('radio', { name: 'Poo' }))
    await userEvent.click(screen.getByRole('button', { name: /add a note/i }))
    await userEvent.type(screen.getByLabelText('Note for this entry'), 'soft stool')
    await userEvent.click(screen.getByRole('button', { name: 'Log it' }))

    expect(log.mock.calls[0]![0].note).toBe('soft stool')
    // Folds back up, so nothing carries into the next entry.
    expect(screen.queryByRole('button', { name: 'Log it' })).not.toBeInTheDocument()
  })

  it('undoes everything one submit created', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(screen.getByRole('radio', { name: 'Pee' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log it' }))

    const [, options] = toast.mock.calls[0]!
    options.action.onClick()
    expect(undo).toHaveBeenCalledTimes(2)
  })
})

describe('the crate and the bed', () => {
  it('offers all five places', () => {
    setup(bothOutside)
    for (const name of ['Pen', 'Outside', 'Inside', 'Crate', 'Bed']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('logs a move into the crate for every dog', async () => {
    setup(bothOutside)
    await userEvent.click(screen.getByRole('button', { name: 'Crate' }))

    expect(log).toHaveBeenCalledTimes(2)
    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'location', location: 'crate' })
    }
  })

  it('lights the bed once they are both on it', () => {
    setup([placed(DOG_A, 'bed'), placed(DOG_B, 'bed')])
    // Closed, the lit button is where they are.
    expect(screen.getByRole('button', { name: 'Bed' })).toBeInTheDocument()
  })

  it('files a potty in the bed at the bed', async () => {
    setup([placed(DOG_A, 'bed'), placed(DOG_B, 'bed')])
    await openDetails()
    await userEvent.click(screen.getByRole('radio', { name: 'Poo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log it' }))

    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'potty', location: 'bed' })
    }
  })
})
