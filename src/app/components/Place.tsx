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

/** Shared by places and potty kinds so one row reads at a single scale. */
export function Glyph({
  text,
  label,
  size = PLACE_GLYPH_PX,
}: {
  text: string
  label: string
  size?: number
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center"
      style={{ fontSize: size, lineHeight: 1 }}
      title={label}
      aria-hidden
    >
      {text}
    </span>
  )
}

export function PlaceGlyph({
  location,
  size = PLACE_GLYPH_PX,
}: {
  location: Location
  size?: number
}) {
  return <Glyph text={GLYPHS[location]} label={LOCATION_LABELS[location]} size={size} />
}
