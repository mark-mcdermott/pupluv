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
import { BARK_GLYPH, LOCATION_GLYPHS, POTTY_GLYPHS } from '../src/lib/domain'
import { glyphName, glyphParts } from '../src/app/lib/glyphs'

const SOURCE = 'node_modules/@twemoji/svg'
const OUT = 'public/glyphs'
const BACKUP = 'backups/pupluv.json'

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
  ...dogGlyphs(),
].flatMap(glyphParts)

const wanted = [...new Set(used.map(glyphName))].sort()

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const missing: string[] = []
for (const name of wanted) {
  const from = join(SOURCE, `${name}.svg`)
  if (!existsSync(from)) {
    missing.push(name)
    continue
  }
  copyFileSync(from, join(OUT, `${name}.svg`))
}

if (missing.length) {
  console.error(`no Twemoji artwork for: ${missing.join(', ')}`)
  process.exit(1)
}

console.log(`${OUT}: ${readdirSync(OUT).length} glyphs`)
console.log(wanted.join(' '))
