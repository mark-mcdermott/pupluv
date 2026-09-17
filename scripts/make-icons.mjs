// Regenerates every icon from assets/logo.png, the single source of truth.
// Run after replacing it:  pnpm icons
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const SRC = 'assets/logo.png'

// The place buttons in the deck, resolved out of CSS: their fill is
// color-mix(in oklab, <accent> 50%, white) over the dark-theme amber and teal.
const GRADIENT = ['#f3d0ad', '#aadad6']
// Behind the gradient, for the alpha flatten. Any colour works; nothing shows.
const GROUND = GRADIENT[0]
const APP_ICON = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'

const { width, height } = await sharp(SRC).metadata()
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
