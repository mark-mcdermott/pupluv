/**
 * Emoji are drawn either by the system font or by vendored Twemoji artwork.
 * Images exist so a glyph can be replaced by a better one — the cookie wants to
 * be an Oreo — without every dog on the phone having to agree it is a cookie.
 *
 * Flip this to switch the whole app back to the system's own emoji. The widget
 * carries the same switch in `iphone/App/Widget/PupluvWidget.swift`; they are
 * separate builds and cannot share a constant.
 */
export type GlyphStyle = 'native' | 'twemoji'
export const GLYPH_STYLE: GlyphStyle = 'twemoji'

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** A string of emoji, split into the characters that each have their own file. */
export function glyphParts(text: string): string[] {
  return [...SEGMENTER.segment(text)].map((part) => part.segment)
}

/**
 * Twemoji files are named for their code points in hex, joined by dashes, with
 * the variation selector dropped — 🗯️ is U+1F5EF U+FE0F and lives in 1f5ef.svg.
 */
export function glyphName(emoji: string): string {
  return [...emoji]
    .map((char) => char.codePointAt(0)!)
    .filter((point) => point !== 0xfe0f)
    .map((point) => point.toString(16))
    .join('-')
}

export function glyphSrc(emoji: string): string {
  return `/glyphs/${glyphName(emoji)}.svg`
}
