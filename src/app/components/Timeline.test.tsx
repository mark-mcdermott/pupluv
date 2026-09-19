import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventSchema, type Dog, type PupEvent } from '@/lib/domain'
import { clockLabel } from '../lib/time'
import { Timeline } from './Timeline'

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

/** The kinds that share the glyph column: present or absent, no other detail. */
function mark(
  type: 'bark' | 'meal' | 'sleep',
  dogId: string,
  occurredAt: string,
  location = 'crate',
): PupEvent {
  return eventSchema.parse({
    id: `77777777-7777-4777-8777-${String(++uid).padStart(12, '0')}`,
    dogId,
    type,
    occurredAt,
    location,
    ...(type === 'meal' ? { amount: null } : {}),
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

/** What a glyph draws, whether it draws characters or vendored artwork. */
function drawn(element: HTMLElement): string {
  const images = [...element.querySelectorAll('img')]
  return images.length ? images.map((image) => image.alt).join('') : element.textContent!
}

beforeEach(() => {
})

describe('Timeline', () => {
  it('identifies dogs by emoji rather than name', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9))]} />)
    expect(drawn(screen.getByRole('img', { name: 'Oreo' }))).toBe('🍪')
    expect(screen.queryByText('Oreo')).not.toBeInTheDocument()
  })

  it('collapses a move logged with its potty into the one entry it was', () => {
    const at = todayAt(9)
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, at), moved(DOG_A, at)]} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Oreo' })).toBeInTheDocument()
  })

  it('keeps a move logged on its own as its own entry', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9)), moved(DOG_A, todayAt(10))]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('collapses one both-dogs entry into a single row carrying both emoji', () => {
    const at = todayAt(9)
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, at), potty(DOG_B, at)]} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(drawn(screen.getByRole('img', { name: 'Oreo and Ramen' }))).toBe('🍪🍜')
  })

  it('keeps entries logged at different times apart', () => {
    render(
      <Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9)), potty(DOG_B, todayAt(11))]} />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('hands the move over with the potty it was logged with', async () => {
    const at = todayAt(9)
    const group = [potty(DOG_A, at), moved(DOG_A, at)]
    const onEdit = vi.fn()
    render(<Timeline dogs={DOGS} events={group} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: /^Edit:/ }))

    expect(onEdit.mock.calls[0]![0]).toHaveLength(2)
  })

  it('puts a bark in the same column a potty would use', () => {
    const at = todayAt(9)
    const bark = eventSchema.parse({
      id: '44444444-4444-4444-8444-000000000001',
      dogId: DOG_A,
      type: 'bark',
      occurredAt: at,
      location: 'pen',
    })
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, at), bark]} />)

    // One glyph carrying both, not two glyphs a column apart.
    expect(drawn(screen.getByTitle('Poo and Barked'))).toBe('💩🗯️')
    expect(screen.queryByTitle('Barked')).not.toBeInTheDocument()
  })

  it('gives a bark on its own the place glyph the others get', () => {
    const bark = eventSchema.parse({
      id: '44444444-4444-4444-8444-000000000002',
      dogId: DOG_A,
      type: 'bark',
      occurredAt: todayAt(9),
      location: 'outside',
    })
    render(<Timeline dogs={DOGS} events={[bark]} />)

    expect(screen.getByTitle('Outside')).toBeInTheDocument()
    expect(drawn(screen.getByTitle('Barked'))).toBe('🗯️')
  })

  it('shows a recorded note', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9), 'ate grass')]} />)
    expect(screen.getByText('ate grass')).toBeInTheDocument()
  })

  it('hands the whole entry to the deck when the row is tapped', async () => {
    const at = todayAt(9)
    const group = [potty(DOG_A, at), potty(DOG_B, at)]
    const onEdit = vi.fn()
    render(<Timeline dogs={DOGS} events={group} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: /^Edit:/ }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0]![0].map((event: PupEvent) => event.id).sort()).toEqual(
      group.map((event) => event.id).sort(),
    )
  })

  it('marks only the row being edited', () => {
    const one = potty(DOG_A, todayAt(9))
    const two = potty(DOG_A, todayAt(10))
    render(<Timeline dogs={DOGS} events={[one, two]} editing={[two]} />)

    const rows = screen.getAllByRole('button', { name: /^Edit:/ })
    const marked = rows.filter((row) => row.className.includes('ring-line'))
    expect(marked).toHaveLength(1)
    expect(marked[0]).toHaveTextContent(clockLabel(two.occurredAt))
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
    // e.g. "Fri 9/11" — weekday then a numeric date, no comma.
    expect(headings[0]).toMatch(/^[A-Za-z]{3,4} \d{1,2}\/\d{1,2}$/)
    expect(headings[1]).toBe('Yesterday')
    expect(headings[2]).toBe('Today')
  })

  // Oldest first: the list reads the way the day happened, and the newest entry
  // is the one nearest the deck.
  it('keeps today last, whatever order sync hands them over in', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(9)), potty(DOG_A, daysBack(3))]} />)
    const headings = screen.getAllByRole('heading')
    expect(headings.at(-1)).toHaveTextContent('Today')
  })

  it('puts the newest entry of a day at the bottom of it', () => {
    render(<Timeline dogs={DOGS} events={[potty(DOG_A, todayAt(17)), potty(DOG_A, todayAt(9))]} />)
    const rows = screen.getAllByRole('button', { name: /^Edit:/ })
    expect(rows.at(-1)).toHaveTextContent(clockLabel(todayAt(17)))
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
    expect(drawn(screen.getByRole('img', { name: 'Oreo and Ramen' }))).toBe('🍪🍜')
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
    expect(drawn(screen.getByRole('img', { name: 'Oreo and Ramen' }))).toBe('🍪🍜')
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

  it('files a sleep at its place, and says so with glyphs rather than words', () => {
    render(<Timeline dogs={DOGS} events={[mark('sleep', DOG_A, todayAt(21))]} />)

    // The place shows beside the mark rather than the mark standing in for it.
    expect(drawn(screen.getByTitle('Crate'))).toBe('📦')
    expect(drawn(screen.getByTitle('Slept'))).toBe('😴')
    expect(screen.queryByText(/Slept in/)).not.toBeInTheDocument()
  })

  it('puts every mark in one column, in a fixed order', () => {
    const at = todayAt(21)
    render(
      <Timeline
        dogs={DOGS}
        events={[mark('sleep', DOG_A, at), mark('bark', DOG_A, at), mark('meal', DOG_A, at)]}
      />,
    )

    expect(drawn(screen.getByTitle('Barked and Ate and Slept'))).toBe('🗯️🦴😴')
  })
})
