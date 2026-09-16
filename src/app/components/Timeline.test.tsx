import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventSchema, type Dog, type PupEvent } from '@/lib/domain'
import { Timeline } from './Timeline'

const { annotate, undo } = vi.hoisted(() => ({ annotate: vi.fn(), undo: vi.fn() }))
vi.mock('../lib/sync', () => ({ annotate, undo }))

const DOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOGS: Dog[] = [{ id: DOG, name: 'Oreo', accent: 'amber' }]

function todayAt(hour: number): string {
  const date = new Date()
  date.setHours(hour, 30, 0, 0)
  return date.toISOString()
}

function potty(note: string | null = null): PupEvent {
  return eventSchema.parse({
    id: '99999999-9999-4999-8999-999999999999',
    dogId: DOG,
    type: 'potty',
    occurredAt: todayAt(9),
    location: 'inside',
    pottyKind: 'poo',
    note,
  })
}

beforeEach(() => {
  annotate.mockReset()
  undo.mockReset()
})

describe('Timeline notes', () => {
  it('shows a note that was already recorded', () => {
    render(<Timeline dogs={DOGS} events={[potty('ate grass')]} />)
    expect(screen.getByText('ate grass')).toBeInTheDocument()
  })

  it('lets a note be added to an entry after the fact', async () => {
    render(<Timeline dogs={DOGS} events={[potty()]} />)
    await userEvent.click(screen.getByRole('button', { name: /add note for/i }))
    await userEvent.type(screen.getByRole('textbox'), 'third time today')
    await userEvent.tab()

    expect(annotate).toHaveBeenCalledWith(potty().id, 'third time today')
  })

  it('clears a note back to null rather than an empty string', async () => {
    render(<Timeline dogs={DOGS} events={[potty('wrong')]} />)
    await userEvent.click(screen.getByRole('button', { name: /edit note for/i }))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.tab()

    expect(annotate).toHaveBeenCalledWith(potty().id, null)
  })

  it('abandons the edit on escape without writing', async () => {
    render(<Timeline dogs={DOGS} events={[potty('keep me')]} />)
    await userEvent.click(screen.getByRole('button', { name: /edit note for/i }))
    await userEvent.type(screen.getByRole('textbox'), ' changed')
    await userEvent.keyboard('{Escape}')

    expect(annotate).not.toHaveBeenCalled()
    expect(screen.getByText('keep me')).toBeInTheDocument()
  })

  it('still offers removal alongside the note affordance', async () => {
    render(<Timeline dogs={DOGS} events={[potty()]} />)
    await userEvent.click(screen.getByRole('button', { name: /^remove:/i }))
    expect(undo).toHaveBeenCalledWith(potty().id)
  })
})
