const ACCENTS: Record<string, string> = {
  amber: 'var(--color-amber)',
  teal: 'var(--color-teal)',
}

export function accentColor(accent: string): string {
  return ACCENTS[accent] ?? 'var(--color-ink)'
}
