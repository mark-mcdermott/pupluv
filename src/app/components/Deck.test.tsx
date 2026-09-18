import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventSchema, type Dog, type PupEvent } from '@/lib/domain'
import { Deck } from './Deck'

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

function setup(events: PupEvent[] = []) {
  return render(<Deck dogs={DOGS} events={events} />)
}

const pottied = (
  dogId: string,
  occurredAt: string,
  pottyKind: 'pee' | 'poo' | 'both' = 'pee',
  note: string | null = null,
): PupEvent =>
  eventSchema.parse({
    id: `77777777-7777-4777-8777-${String(++uid).padStart(12, '0')}`,
    dogId,
    type: 'potty',
    occurredAt,
    location: 'outside',
    pottyKind,
    note,
  })

const button = (name: string) => screen.getByRole('button', { name })
const openDetails = () => userEvent.click(button('Add details'))
const send = () => userEvent.click(button('Submit'))

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
  it('shows only the places plus the eye', () => {
    setup(bothOutside)
    expect(button('Pen')).toBeInTheDocument()
    expect(button('Add details')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pee' })).not.toBeInTheDocument()
  })

  it('logs a move for every dog on a single tap', async () => {
    setup(bothOutside)
    await userEvent.click(button('Pen'))

    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls.map(([event]) => event.dogId)).toEqual([DOG_A, DOG_B])
    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'location', location: 'pen' })
    }
  })

  it('moves only the dog that is not already there', async () => {
    setup(apart)
    await userEvent.click(button('Outside'))

    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toMatchObject({ dogId: DOG_B, location: 'outside' })
  })

  it('does nothing when they are already there', async () => {
    setup(bothOutside)
    await userEvent.click(button('Outside'))
    expect(log).not.toHaveBeenCalled()
  })
})

describe('Deck open', () => {
  it('turns the eye into a way back out', async () => {
    setup(bothOutside)
    await openDetails()
    expect(button('Hide details')).toBeInTheDocument()

    await userEvent.click(button('Hide details'))
    expect(button('Add details')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
  })

  it('starts with every dog taken', async () => {
    setup(bothOutside)
    await openDetails()
    for (const dog of DOGS) {
      expect(button(dog.name)).toHaveAttribute('aria-pressed', 'true')
    }
  })

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
    expect(button('Submit')).toBeDisabled()
  })

  it('will not submit with no dog taken', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Pee'))
    for (const dog of DOGS) await userEvent.click(button(dog.name))

    expect(button('Submit')).toBeDisabled()
  })

  it('folds away on Cancel without writing', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Pee'))
    await userEvent.click(button('Cancel'))

    expect(log).not.toHaveBeenCalled()
    expect(button('Add details')).toBeInTheDocument()
  })

  it('has no Delete until there is something to delete', async () => {
    setup(bothOutside)
    await openDetails()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('reads pee and poo together as one entry', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Pee'))
    await userEvent.click(button('Poo'))
    await send()

    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'potty', pottyKind: 'both' })
    }
  })

  it('lets a pick be taken back', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Pee'))
    expect(button('Pee')).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(button('Pee'))
    expect(button('Pee')).toHaveAttribute('aria-pressed', 'false')
  })

  it('writes nothing until Submit', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Poo'))
    expect(log).not.toHaveBeenCalled()

    await send()
    expect(log).toHaveBeenCalledTimes(2)
    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'potty', pottyKind: 'poo', location: 'outside' })
    }
  })

  it('records only the dogs still taken', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Oreo'))
    await userEvent.click(button('Pee'))
    await send()

    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toMatchObject({ dogId: DOG_B, type: 'potty' })
  })

  it('files each dog at its own place when no place is chosen', async () => {
    setup(apart)
    await openDetails()
    await userEvent.click(button('Pee'))
    await send()

    const byDog = Object.fromEntries(log.mock.calls.map(([e]) => [e.dogId, e.location]))
    expect(byDog).toEqual({ [DOG_A]: 'outside', [DOG_B]: 'inside' })
  })

  it('gives the move and the potty the one instant they happened at', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Pee'))
    await userEvent.click(screen.getByRole('radio', { name: 'Inside' }))
    await send()

    const stamps = new Set(log.mock.calls.map(([event]) => event.occurredAt))
    expect(stamps.size).toBe(1)
  })

  it('records the move alongside the potty when the place changed', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Ramen'))
    await userEvent.click(button('Pee'))
    await userEvent.click(screen.getByRole('radio', { name: 'Inside' }))
    await send()

    const types = log.mock.calls.map(([e]) => e.type)
    expect(types).toEqual(['potty', 'location'])
    expect(log.mock.calls[0]![0]).toMatchObject({ dogId: DOG_A, location: 'inside' })
  })

  it('attaches a note and clears it after submitting', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Poo'))
    await userEvent.type(screen.getByLabelText('Note for this entry'), 'soft stool')
    await send()

    expect(log.mock.calls[0]![0].note).toBe('soft stool')
    // Folds back up, so nothing carries into the next entry.
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
  })

  it('undoes everything one submit created', async () => {
    setup(bothOutside)
    await openDetails()
    await userEvent.click(button('Pee'))
    await send()

    const [, options] = toast.mock.calls[0]!
    options.action.onClick()
    expect(undo).toHaveBeenCalledTimes(2)
  })
})

describe('the crate and the bed', () => {
  it('offers all five places', () => {
    setup(bothOutside)
    for (const name of ['Pen', 'Outside', 'Inside', 'Crate', 'Bed']) {
      expect(button(name)).toBeInTheDocument()
    }
  })

  it('logs a move into the crate for every dog', async () => {
    setup(bothOutside)
    await userEvent.click(button('Crate'))

    expect(log).toHaveBeenCalledTimes(2)
    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'location', location: 'crate' })
    }
  })

  it('lights the bed once they are both on it', () => {
    setup([placed(DOG_A, 'bed'), placed(DOG_B, 'bed')])
    // Closed, the lit button is where they are.
    expect(button('Bed')).toBeInTheDocument()
  })

  it('files a potty in the bed at the bed', async () => {
    setup([placed(DOG_A, 'bed'), placed(DOG_B, 'bed')])
    await openDetails()
    await userEvent.click(button('Poo'))
    await send()

    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'potty', location: 'bed' })
    }
  })
})

describe('editing an entry', () => {
  const AT = '2026-09-16T14:30:00.000Z'

  function edit(group: PupEvent[], events: PupEvent[] = bothOutside) {
    const onDone = vi.fn()
    render(<Deck dogs={DOGS} events={events} editing={group} onDone={onDone} />)
    return onDone
  }

  it('opens the row already wearing the entry', () => {
    edit([pottied(DOG_B, AT, 'both', 'soft stool')])

    expect(button('Ramen')).toHaveAttribute('aria-pressed', 'true')
    expect(button('Oreo')).toHaveAttribute('aria-pressed', 'false')
    expect(button('Pee')).toHaveAttribute('aria-pressed', 'true')
    expect(button('Poo')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Note for this entry')).toHaveValue('soft stool')
    expect(screen.getByRole('radio', { name: 'Outside' })).toBeChecked()
  })

  it('adds Delete to Cancel and Submit', () => {
    edit([pottied(DOG_A, AT)])

    expect(button('Delete')).toBeInTheDocument()
    expect(button('Cancel')).toBeInTheDocument()
    expect(button('Submit')).toBeInTheDocument()
  })

  it('tombstones the whole entry on Delete, and writes nothing back', async () => {
    const original = [pottied(DOG_A, AT), pottied(DOG_B, AT)]
    const onDone = edit(original)
    await userEvent.click(button('Delete'))

    expect(undo.mock.calls.flat()).toEqual(original.map((event) => event.id))
    expect(log).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it('writes nothing on Cancel', async () => {
    const onDone = edit([pottied(DOG_A, AT)])
    await userEvent.click(button('Cancel'))

    expect(log).not.toHaveBeenCalled()
    expect(undo).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it('replaces the entry rather than editing it in place', async () => {
    const original = [pottied(DOG_A, AT), pottied(DOG_B, AT)]
    edit(original)
    await userEvent.click(button('Poo'))
    await userEvent.click(button('Submit'))

    expect(undo.mock.calls.flat()).toEqual(original.map((event) => event.id))
    expect(log).toHaveBeenCalledTimes(2)
    for (const [event] of log.mock.calls) {
      expect(event).toMatchObject({ type: 'potty', pottyKind: 'both', location: 'outside' })
    }
  })

  it('drops a dog left out of the edit', async () => {
    edit([pottied(DOG_A, AT), pottied(DOG_B, AT)])
    await userEvent.click(button('Oreo'))
    await userEvent.click(button('Submit'))

    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toMatchObject({ dogId: DOG_B })
  })

  it('carries the entry to a corrected time', async () => {
    edit([pottied(DOG_A, AT)])
    const when = screen.getByLabelText('When this happened')
    await userEvent.clear(when)
    await userEvent.type(when, '2026-09-16T09:15')
    await userEvent.click(button('Submit'))

    expect(new Date(log.mock.calls[0]![0].occurredAt as string).getHours()).toBe(9)
  })

  it('keeps the move that was logged with the potty', async () => {
    const at = AT
    const original = [pottied(DOG_A, at), placed(DOG_A, 'outside')]
    edit(original)
    await userEvent.click(button('Submit'))

    const types = log.mock.calls.map(([event]) => event.type)
    expect(types).toEqual(['potty', 'location'])
  })

  it('survives the dogs arriving again from a sync', async () => {
    const group = [pottied(DOG_A, AT)]
    const view = render(
      <Deck dogs={DOGS} events={bothOutside} editing={group} onDone={vi.fn()} />,
    )
    await userEvent.type(screen.getByLabelText('Note for this entry'), 'half typed')

    // A fresh array with the same dogs in it, which is what every sync produces.
    view.rerender(
      <Deck dogs={[...DOGS]} events={bothOutside} editing={group} onDone={vi.fn()} />,
    )
    expect(screen.getByLabelText('Note for this entry')).toHaveValue('half typed')
  })

  it('leaves a move a move when the potty is taken off it', async () => {
    edit([placed(DOG_A, 'outside')])
    await userEvent.click(button('Submit'))

    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toMatchObject({ type: 'location', location: 'outside' })
  })
})
