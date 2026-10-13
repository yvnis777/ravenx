// Builds every RavenX logo asset from one raven path.
const fs = require('fs'), path = require('path')
const root = process.argv[2], sharp = require(root + '/ravenx-frontend/node_modules/sharp')
const AMBER = '#f5a623', INK = '#0a0a0c'
// 64×64 grid, raven perched facing right
const BODY = 'M62 17 L50 12 L44 8.5 L37 9.5 L32 15 L26 26 L6 50 L2 60 L13 56 L22 52 L32 50 L40 44 L44 36 L44 30 L47 25 L46 22.5 L53 21 Z'
const LEGS = 'M26.8 47 L29.2 47 L28.4 60 L26 60 Z M34 45 L36.4 45 L36.4 60 L34 60 Z'
const EYE = 'M39 13.5 L42.5 15.5 L39 17.5 Z'
// body and legs are separate paths: in one path their opposite windings cancel where they overlap
const raven = (ink, eye) => `<path d="${BODY}" fill="${ink}"/><path d="${LEGS}" fill="${ink}"/><path d="${EYE}" fill="${eye}"/>`
// glyph inset 12% inside a 64 tile
const inner = (ink, eye) => `<g transform="translate(7.68 7.68) scale(0.76)">${raven(ink, eye)}</g>`
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>\n`
const tile = svg(`<rect width="64" height="64" rx="14" fill="${AMBER}"/>${inner(INK, AMBER)}`)
const square = svg(`<rect width="64" height="64" fill="${AMBER}"/>${inner(INK, AMBER)}`)
// transparent glyph: the eye is cut out with a mask so it shows whatever is behind
const glyph = svg(`<mask id="eye"><rect width="64" height="64" fill="#fff"/><path d="${EYE}" fill="#000"/></mask><g mask="url(#eye)" fill="${INK}"><path d="${BODY}"/><path d="${LEGS}"/></g>`)
const b = path.join(root, 'branding'), fe = path.join(root, 'ravenx-frontend')
fs.writeFileSync(`${b}/ravenx-raven.svg`, tile)
fs.writeFileSync(`${b}/ravenx-raven-square.svg`, square)
fs.writeFileSync(`${b}/ravenx-raven-glyph.svg`, glyph)
fs.writeFileSync(`${fe}/app/icon.svg`, tile)
const png = (s, size, out) => sharp(Buffer.from(s), { density: size * 72 / 64 * 1.5 }).resize(size, size).png().toFile(out)
;(async () => {
  await png(tile, 1024, `${b}/ravenx-raven-1024.png`)
  await png(tile, 512, `${b}/ravenx-raven-512.png`)
  await png(square, 1024, `${b}/ravenx-raven-square-1024.png`)
  await png(square, 180, `${fe}/app/apple-icon.png`)
  await png(tile, 512, `${fe}/public/ravenx-icon-512.png`)
  // favicon.ico: PNG-encoded entries at 16/32/48
  const sizes = [16, 32, 48]
  const imgs = await Promise.all(sizes.map(s => sharp(Buffer.from(tile), { density: 300 }).resize(s, s).png().toBuffer()))
  const head = Buffer.alloc(6 + 16 * sizes.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4)
  let off = head.length
  imgs.forEach((img, i) => { const e = 6 + 16 * i
    head.writeUInt8(sizes[i], e); head.writeUInt8(sizes[i], e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(img.length, e + 8); head.writeUInt32LE(off, e + 12); off += img.length })
  fs.writeFileSync(`${fe}/app/favicon.ico`, Buffer.concat([head, ...imgs]))
  console.log('built')
})()
