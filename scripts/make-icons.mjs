// Regenerates every icon from the largest logo in brand/, the single source of
// truth. Run after replacing it:  pnpm icons [path/to/logo.png]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const BRAND = 'brand'

// The place buttons in the deck, resolved out of CSS: their fill is
// color-mix(in oklab, <accent> 50%, white) over the dark-theme amber and teal.
const GRADIENT = ['#f3d0ad', '#aadad6']
// Behind the gradient, for the alpha flatten. Any colour works; nothing shows.
const GROUND = GRADIENT[0]
const APP_ICON = 'iphone/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
const MAC_ICONS = 'desktop/icons'

/**
 * Apple's macOS icon grid. Unlike iOS, the system draws no mask: the rounded
 * square is part of the art, inset in a transparent canvas so the shadow and
 * the neighbouring icons have room. At 1024 the tile is 824 across with a
 * corner radius of 185.4.
 */
const MAC_CANVAS = 1024
const MAC_TILE = 824
const MAC_RADIUS = 185.4

/**
 * The biggest logo in brand/, or a path given on the command line. Resolved by
 * reading each file rather than parsing its name, so a re-export at new
 * dimensions needs no edit here — and the largest is always the best source to
 * rasterise from.
 */
async function findSource() {
  if (process.argv[2]) return process.argv[2]

  const candidates = readdirSync(BRAND).filter((name) => /^logo.*\.(png|jpe?g|webp)$/i.test(name))
  if (candidates.length === 0) {
    throw new Error(`no logo*.png in ${BRAND}/ — pass one: pnpm icons <path>`)
  }

  const measured = await Promise.all(
    candidates.map(async (name) => {
      const file = join(BRAND, name)
      const { width = 0, height = 0 } = await sharp(file).metadata()
      return { file, pixels: width * height }
    }),
  )
  return measured.sort((a, b) => b.pixels - a.pixels)[0].file
}

const SRC = await findSource()
const { width, height } = await sharp(SRC).metadata()
console.log(`source: ${SRC}  ${width}x${height}`)
const side = Math.max(width, height)

// Square the canvas by padding, never by stretching — the art is wider than it
// is tall and squashing it to a square would distort the face.
const squared = await sharp(SRC)
  .extend({
    top: Math.floor((side - height) / 2),
    bottom: Math.ceil((side - height) / 2),
    left: Math.floor((side - width) / 2),
    right: Math.ceil((side - width) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer()

// Favicons fill the tile: at 16px every pixel is doing work.
await sharp(squared).resize(96, 96).png().toFile('public/favicon-96.png')

// Apple and iOS need an opaque ground — transparency renders as black — and an
// inset, because iOS masks to a squircle and would clip a full-bleed subject.
const backdrop = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${GRADIENT[0]}"/>` +
      `<stop offset="1" stop-color="${GRADIENT[1]}"/>` +
      `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  )

const onGround = async (size) =>
  // No density option: the svg carries explicit pixel dimensions, and a density
  // override would scale it (300/72) and silently produce a 4267px icon.
  sharp(backdrop(size))
    .composite([
      { input: await sharp(squared).resize(Math.round(size * 0.76)).toBuffer(), gravity: 'centre' },
    ])
    .flatten({ background: GROUND })
    // flatten() paints the ground but leaves the channel behind. iOS rejects an
    // app icon that carries alpha at all, opaque or not.
    .removeAlpha()
    .png()
    .toBuffer()

await sharp(await onGround(1024)).toFile(APP_ICON)
await sharp(await onGround(180)).toFile('public/apple-touch-icon.png')

// macOS draws the icon unmasked, so the tile and its corners are ours to draw.
const macArt = async () => {
  const inset = (MAC_CANVAS - MAC_TILE) / 2
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAC_CANVAS}" height="${MAC_CANVAS}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${GRADIENT[0]}"/>` +
      `<stop offset="1" stop-color="${GRADIENT[1]}"/>` +
      `</linearGradient></defs>` +
      `<rect x="${inset}" y="${inset}" width="${MAC_TILE}" height="${MAC_TILE}" ` +
      `rx="${MAC_RADIUS}" ry="${MAC_RADIUS}" fill="url(#g)"/></svg>`,
  )
  return sharp(tile)
    .composite([
      { input: await sharp(squared).resize(Math.round(MAC_TILE * 0.76)).toBuffer(), gravity: 'centre' },
    ])
    .png()
    .toBuffer()
}

// iconutil is the only thing that writes an icns, and it reads an iconset
// folder — a build artefact, so it lives in TMPDIR and leaves nothing behind.
const art = await macArt()
const iconset = `${process.env.TMPDIR ?? '/tmp'}/pupluv.iconset`
rmSync(iconset, { recursive: true, force: true })
mkdirSync(iconset, { recursive: true })
for (const size of [16, 32, 128, 256, 512]) {
  await sharp(art).resize(size, size).png().toFile(join(iconset, `icon_${size}x${size}.png`))
  await sharp(art)
    .resize(size * 2, size * 2)
    .png()
    .toFile(join(iconset, `icon_${size}x${size}@2x.png`))
}
mkdirSync(MAC_ICONS, { recursive: true })
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(MAC_ICONS, 'icon.icns')])
rmSync(iconset, { recursive: true, force: true })

// Tauri names these by size; they are what a non-macOS build would use for the
// window, and the config lists them either way.
for (const [name, size] of [
  ['32x32.png', 32],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
]) {
  await sharp(art).resize(size, size).png().toFile(join(MAC_ICONS, name))
}

// ICO carries the small sizes browsers actually ask for.
const tmp = []
for (const size of [16, 32, 48]) {
  const path = `${process.env.TMPDIR ?? '/tmp'}/pupluv-ico-${size}.png`
  await sharp(squared).resize(size, size).png().toFile(path)
  tmp.push(path)
}
execFileSync('magick', [...tmp, 'public/favicon.ico'])

console.log(`${APP_ICON}  1024x1024, opaque`)
console.log('public/apple-touch-icon.png  180x180, opaque')
console.log('public/favicon-96.png  96x96')
console.log('public/favicon.ico  16/32/48')
console.log(`${MAC_ICONS}/icon.icns  16-1024, rounded tile on a clear canvas`)
