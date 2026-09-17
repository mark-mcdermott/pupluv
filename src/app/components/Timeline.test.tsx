import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventSchema, type Dog, type PupEvent } from '@/lib/domain'
import { Timeline } from './Timeline'

const { annotate, undo } = vi.hoisted(() => ({ annotate: vi.fn(), undo: vi.fn() }))
vi.mock('../lib/sync', () => ({ annotate, undo }))

const DOG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// Order matters: the row follows this list, not the order events arrive in.
const DOGS: Dog[] = [
  { id: DOG_A, name: 'Oreo', accent: 'amber', emoji: '🍪' },
  { id: DOG_B, name: 'Ramen', accent: 'teal', emoji: '🍜' },
]

function todayAt(hour: number, minute = 30): string {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

function daysBack(days: number, hour = 9): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 15, 0, 0)
  return date.toISOString()
}

let uid = 0
function potty(dogId: string, occurredAt: string, note: string | null = null): PupEvent {
  return eventSchema.parse({
    id: `99999999-9999-4999-8999-${String(++uid).padStart(12, '0')}`,
    dogId,
    type: 'potty',
    occurredAt,
    location: 'pen',
    pottyKind: 'poo',
    note,
  })
}

function moved(dogId: string, occurredAt: string, location = 'pen'): PupEvent {
  return eventSchema.parse({
    id: `88888888-8888-4888-8888-${String(++uid).padStart(12, '0')}`,
    dogId,
    type: 'location',
    occurredAt,
    location,
  })
}

beforeEach(() => {
  annotate.mockReset()
  undo.mockReset()
})

describe('Timeline', () => {
  it('identifies dogs by emoji rather than name', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9))]} />)
    expect(screen.getByRole('img', { name: 'Oreo' })).toHaveTextContent('🍪')
    expect(screen.queryByText('Oreo')).not.toBeInTheDocument()
  })

  it('collapses a move logged with its potty into the one entry it was', () => {
    const at = todayAt(9)
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, at), moved(DOG_A, at)]} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Oreo' })).toBeInTheDocument()
  })

  it('removes the move along with the potty it was logged with', async () => {
    const at = todayAt(9)
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, at), moved(DOG_A, at)]} />)
    await userEvent.click(screen.getByRole('button', { name: /^Remove:/ }))

    expect(undo).toHaveBeenCalledTimes(2)
  })

  it('keeps a move logged on its own as its own entry', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9)), moved(DOG_A, todayAt(10))]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('collapses one both-dogs entry into a single row carrying both emoji', () => {
    const at = todayAt(9)
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, at), potty(DOG_B, at)]} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Oreo and Ramen' })).toHaveTextContent('🍪🍜')
  })

  it('keeps entries logged at different times apart', () => {
    render(
      <Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9)), potty(DOG_B, todayAt(11))]} />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('removes every event behind a grouped row', async () => {
    const at = todayAt(9)
    const group = [potty(DOG_A, at), potty(DOG_B, at)]
    render(<Timeline dogs={DOGS} events={group} />)
    await userEvent.click(screen.getByRole('button', { name: /^remove:/i }))

    expect(undo).toHaveBeenCalledTimes(2)
    expect(undo.mock.calls.flat()).toEqual(group.map((event) => event.id))
  })

  it('shows a recorded note', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9), 'ate grass')]} />)
    expect(screen.getByText('ate grass')).toBeInTheDocument()
  })

  it('annotates the whole group at once', async () => {
    const at = todayAt(9)
    const group = [potty(DOG_A, at), potty(DOG_B, at)]
    render(<Timeline dogs={DOGS} events={group} />)
    await userEvent.click(screen.getByRole('button', { name: /add note for/i }))
    await userEvent.type(screen.getByRole('textbox'), 'both of them')
    await userEvent.tab()

    expect(annotate).toHaveBeenCalledTimes(2)
    for (const [, note] of annotate.mock.calls) expect(note).toBe('both of them')
  })

  it('abandons an edit on escape without writing', async () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9), 'keep me')]} />)
    await userEvent.click(screen.getByRole('button', { name: /edit note for/i }))
    await userEvent.type(screen.getByRole('textbox'), ' changed')
    await userEvent.keyboard('{Escape}')

    expect(annotate).not.toHaveBeenCalled()
    expect(screen.getByText('keep me')).toBeInTheDocument()
  })
})

describe('Timeline days', () => {
  it('shows entries from before today, not just today', () => {
    render(
      <Timeline
        dogs={DOGS}
        events={[potty(DOG_A, todayAt(9)), potty(DOG_A, daysBack(1)), potty(DOG_A, daysBack(6))]}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('names today and yesterday, and dates anything older', () => {
    render(
      <Timeline
        dogs={DOGS}
        events={[potty(DOG_A, todayAt(9)), potty(DOG_A, daysBack(1)), potty(DOG_A, daysBack(6))]}
      />,
    )
    const headings = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(headings[0]).toBe('Today')
    expect(headings[1]).toBe('Yesterday')
    // e.g. "Fri 9/11" — weekday then a numeric date, no comma.
    expect(headings[2]).toMatch(/^[A-Za-z]{3,4} \d{1,2}\/\d{1,2}$/)
  })

  it('keeps the newest day first', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, daysBack(3)), potty(DOG_A, todayAt(9))]} />)
    expect(screen.getAllByRole('heading')[0]).toHaveTextContent('Today')
  })

  it('files entries under the day they happened on', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9)), potty(DOG_A, daysBack(1))]} />)
    expect(screen.getAllByRole('heading')).toHaveLength(2)
    expect(screen.getAllByRole('list')).toHaveLength(2)
  })

  it('still collapses a both-dogs entry within its day', () => {
    const at = daysBack(2)
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, at), potty(DOG_B, at)]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Oreo and Ramen' })).toHaveTextContent('🍪🍜')
  })

  it('says nothing is logged when there is nothing at all', () => {
    render(<Timeline dogs={DOGS} events={[]} />)
    expect(screen.getByText(/Nothing logged yet today/)).toBeInTheDocument()
  })
})

describe('Timeline row layout', () => {
  it('reads the dogs in list order however the events arrive', () => {
    const at = todayAt(9)
    // Ramen's event first; the row should still follow the dog list.
    render(<Timeline dogs={DOGS} events={[potty(DOG_B, at), potty(DOG_A, at)]} />)
    expect(screen.getByRole('img', { name: 'Oreo and Ramen' })).toHaveTextContent('🍪🍜')
  })

  it('keeps a pair the same way round on every row', () => {
    const a = todayAt(9)
    const b = todayAt(11)
    render(
      <Timeline
        dogs={DOGS}
        events={[potty(DOG_A, a), potty(DOG_B, a), potty(DOG_B, b), potty(DOG_A, b)]}
      />,
    )
    const pairs = screen.getAllByRole('img', { name: 'Oreo and Ramen' }).map((n) => n.textContent)
    expect(new Set(pairs).size).toBe(1)
  })
})
