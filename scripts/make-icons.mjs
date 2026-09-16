// Regenerates every raster icon from public/favicon.svg, which is the only
// source of truth. Run after editing it:  pnpm icons
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const ART = 'public/favicon.svg'
const GROUND = '#141c18'
const APP_ICON = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'

const art = readFileSync(ART, 'utf8')
const inner = art.slice(art.indexOf('>', art.indexOf('<svg')) + 1, art.lastIndexOf('</svg>'))

/** On a ground the drop shadow under the head just reads as dirt, so it goes. */
const onGround = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" fill="${GROUND}"/>` +
    `<g transform="translate(32 33) scale(0.86) translate(-32 -30)">` +
    inner.replace(/<!-- Grounding[\s\S]*?opacity="\.16"\/>/, '') +
    `</g></svg>`,
)

const render = (svg, size) => sharp(svg, { density: 2400 }).resize(size, size)

// iOS rejects an app icon with an alpha channel, and it renders badly besides.
await render(onGround, 1024).flatten({ background: GROUND }).png().toFile(APP_ICON)
await render(onGround, 180).flatten({ background: GROUND }).png().toFile('public/apple-touch-icon.png')

console.log(`${APP_ICON}  1024x1024, opaque`)
console.log('public/apple-touch-icon.png  180x180, opaque')
console.log('public/favicon.ico  rebuild with: pnpm icons:ico')
