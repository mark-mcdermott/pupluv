import { LOCATION_GLYPHS, LOCATION_LABELS, type Location } from '@/lib/domain'
import { GLYPH_STYLE, glyphParts, glyphSrc } from '../lib/glyphs'

/** The dog emoji in a timeline row. */
export const DOG_GLYPH_PX = 18

/** Half again the dog emoji, so the place leads the row rather than trailing it. */
export const PLACE_GLYPH_PX = Math.round(DOG_GLYPH_PX * 1.5)

/**
 * Per-glyph optical corrections, applied only where `tuned` is asked for — which
 * is the timeline, and nowhere else.
 *
 * These are not artwork bugs. A row draws every glyph at one size, edge to edge
 * with its neighbours, and at that scale each of these reads a shade heavy, high
 * or left against the rest. The deck draws the same art isolated inside a tile
 * where none of it shows, and the widget is a separate build that never sees
 * this file — so the correction belongs here rather than in the SVG.
 *
 * `size` is a delta in px and does not change the box: the glyph is drawn
 * smaller inside a slot of the full size, so the columns stay put.
 */
const TUNING: Record<string, { dx?: number; dy?: number; size?: number }> = {
  '🍪': { dy: 1 },
  '📦': { dx: 1 },
  '🛖': { size: -1 },
  '💧': { size: -3 },
  '😴': { size: -3 },
}

/** Shared by places and potty kinds so one row reads at a single scale. */
export function Glyph({
  text,
  label,
  size = PLACE_GLYPH_PX,
  tuned = false,
}: {
  text: string
  label: string
  size?: number
  tuned?: boolean
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
      {glyphParts(text).map((part, index) => {
        const tune = (tuned && TUNING[part]) || {}
        const drawn = size + (tune.size ?? 0)
        return (
          // The slot keeps the full size whatever the glyph inside it does, so a
          // correction moves the drawing and never the column.
          <span
            key={`${part}-${index}`}
            className="inline-flex shrink-0 items-center justify-center"
            style={{ width: size, height: size }}
          >
            <img
              src={glyphSrc(part)}
              alt={part}
              width={drawn}
              height={drawn}
              style={{
                width: drawn,
                height: drawn,
                transform:
                  tune.dx || tune.dy
                    ? `translate(${tune.dx ?? 0}px, ${tune.dy ?? 0}px)`
                    : undefined,
              }}
              draggable={false}
            />
          </span>
        )
      })}
    </span>
  )
}

export function PlaceGlyph({
  location,
  size = PLACE_GLYPH_PX,
  tuned = false,
}: {
  location: Location
  size?: number
  tuned?: boolean
}) {
  return (
    <Glyph
      text={LOCATION_GLYPHS[location]}
      label={LOCATION_LABELS[location]}
      size={size}
      tuned={tuned}
    />
  )
}
