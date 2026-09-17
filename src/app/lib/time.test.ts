import { describe, expect, it } from 'vitest'
import { fromLocalInput, toLocalInput } from './time'

describe('the time an entry can be corrected to', () => {
  // A datetime-local input speaks wall time with no zone, while an event is
  // stored as an instant. Getting this backwards moves entries by the offset.
  it('shows the wall time the entry was logged at', () => {
    const local = new Date(2026, 8, 16, 14, 30)
    expect(toLocalInput(local.toISOString())).toBe('2026-09-16T14:30')
  })

  it('pads a single-digit month, day, hour and minute', () => {
    const local = new Date(2026, 0, 5, 9, 7)
    expect(toLocalInput(local.toISOString())).toBe('2026-01-05T09:07')
  })

  it('round-trips', () => {
    const iso = new Date(2026, 8, 16, 14, 30).toISOString()
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
  })

  it('refuses the half-typed value an input reports mid-edit', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('2026-09-')).toBeNull()
  })
})
