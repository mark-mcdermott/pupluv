import { LOCATION_LABELS, type Location } from '@/lib/domain'

// Emoji throughout, so places and dogs speak one visual language — a line icon
// beside a full-colour emoji reads as a stray mark whatever size it is.
const GLYPHS: Record<Location, string> = {
  pen: '🛖',
  outside: '🌳',
  inside: '🏠',
}

/** The dog emoji in a timeline row. */
export const DOG_GLYPH_PX = 18

/** Half again the dog emoji, so the place leads the row rather than trailing it. */
export const PLACE_GLYPH_PX = Math.round(DOG_GLYPH_PX * 1.5)

export function PlaceGlyph({
  location,
  size = PLACE_GLYPH_PX,
}: {
  location: Location
  size?: number
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center"
      style={{ fontSize: size, lineHeight: 1 }}
      title={LOCATION_LABELS[location]}
      aria-hidden
    >
      {GLYPHS[location]}
    </span>
  )
}
