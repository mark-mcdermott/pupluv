import { LOCATION_GLYPHS, LOCATION_LABELS, type Location } from '@/lib/domain'
import { GLYPH_STYLE, glyphParts, glyphSrc } from '../lib/glyphs'

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
  if (GLYPH_STYLE === 'native') {
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

  // One image per emoji: a pair like 💧💩 is two glyphs in one string, and the
  // vendored artwork is filed one to a code point. The alt is the character it
  // stands for, so a glyph with no artwork still draws something.
  return (
    <span className="inline-flex shrink-0 items-center" title={label} aria-hidden>
      {glyphParts(text).map((part, index) => (
        <img
          key={`${part}-${index}`}
          src={glyphSrc(part)}
          alt={part}
          width={size}
          height={size}
          style={{ width: size, height: size }}
          draggable={false}
        />
      ))}
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
  return <Glyph text={LOCATION_GLYPHS[location]} label={LOCATION_LABELS[location]} size={size} />
}
