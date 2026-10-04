import { type Accent } from '@/lib/domain'

const COLOURS: Record<Accent, string> = {
  teal: 'var(--color-teal)',
  amber: 'var(--color-amber)',
  clay: 'var(--color-clay)',
  moss: 'var(--color-moss)',
}

export function accentColor(accent: string): string {
  return COLOURS[accent as Accent] ?? 'var(--color-ink)'
}
