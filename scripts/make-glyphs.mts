/**
 * Vendors the Twemoji artwork for every emoji the app draws, so the app carries
 * its own glyphs rather than the system's:  pnpm glyphs
 *
 * Offline first, like everything else here — the files are copied into public/
 * and served from the bundle, never fetched. A glyph with no artwork is a hard
 * error rather than a blank space on a phone.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { BARK_GLYPH, DOG_EMOJI, LOCATION_GLYPHS, MEAL_GLYPH, POTTY_GLYPHS, SLEEP_GLYPH } from '../src/lib/domain'
import { glyphName, glyphParts } from '../src/app/lib/glyphs'

const SOURCE = 'node_modules/@twemoji/svg'
/** Drawn here rather than taken from Twemoji, and preferred over it. */
const OVERRIDES = 'brand/glyphs'
const OUT = 'public/glyphs'
/** A folder reference in the widget target, so a new glyph needs no Xcode edit. */
const WIDGET_OUT = 'iphone/App/Widget/Glyphs'
const BACKUP = 'backups/pupluv.json'

/**
 * Big enough for the largest a widget draws one — a place tile on a medium
 * widget is about 21pt of glyph, which is 63px at 3x.
 */
const WIDGET_PX = 144

/** The dogs' emoji are data, not code, so they come from the committed dump. */
function dogGlyphs(): string[] {
  if (!existsSync(BACKUP)) return []
  const dump = JSON.parse(readFileSync(BACKUP, 'utf8')) as { dogs?: { emoji?: string }[] }
  return (dump.dogs ?? []).map((dog) => dog.emoji ?? '').filter(Boolean)
}

const used = [
  ...Object.values(LOCATION_GLYPHS),
  ...Object.values(POTTY_GLYPHS),
  BARK_GLYPH,
  MEAL_GLYPH,
  SLEEP_GLYPH,
  // Every emoji a dog can be chosen as, not just the ones in use today.
  ...DOG_EMOJI,
  ...dogGlyphs(),
].flatMap(glyphParts)

const wanted = [...new Set(used.map(glyphName))].sort()

for (const folder of [OUT, WIDGET_OUT]) {
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
}

const missing: string[] = []
for (const name of wanted) {
  const drawn = join(OVERRIDES, `${name}.svg`)
  const from = existsSync(drawn) ? drawn : join(SOURCE, `${name}.svg`)
  if (!existsSync(from)) {
    missing.push(name)
    continue
  }
  copyFileSync(from, join(OUT, `${name}.svg`))
  // The widget takes raster: SwiftUI reads an SVG only out of an asset catalog,
  // and a folder of files is what lets a new glyph arrive without an Xcode edit.
  await sharp(from).resize(WIDGET_PX, WIDGET_PX).png().toFile(join(WIDGET_OUT, `${name}.png`))
}

if (missing.length) {
  console.error(`no Twemoji artwork for: ${missing.join(', ')}`)
  process.exit(1)
}

const drawn = existsSync(OVERRIDES) ? readdirSync(OVERRIDES).filter((f) => f.endsWith('.svg')) : []
if (drawn.length) console.log(`${OVERRIDES}: ${drawn.map((f) => f.replace('.svg', '')).join(' ')}`)
console.log(`${OUT}: ${readdirSync(OUT).length} svg`)
console.log(`${WIDGET_OUT}: ${readdirSync(WIDGET_OUT).length} png at ${WIDGET_PX}px`)
console.log(wanted.join(' '))
