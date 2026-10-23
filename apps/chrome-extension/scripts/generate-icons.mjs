#!/usr/bin/env node
// Renders the extension icon (a form card with filled lines and a check) to PNG at every manifest size.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons')
const SIZES = [16, 32, 48, 128]
const SAMPLES = 4

const BACKGROUND = [37, 99, 235]
const WHITE = [255, 255, 255]
const ACCENT = [134, 239, 172]

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false
  const cx = Math.min(Math.max(x, left + radius), right - radius)
  const cy = Math.min(Math.max(y, top + radius), bottom - radius)
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Color at a point in the unit square, or null for transparent. */
function shade(x, y) {
  if (!insideRoundedRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) return null
  const check = Math.min(
    distanceToSegment(x, y, 0.6, 0.7, 0.69, 0.79),
    distanceToSegment(x, y, 0.69, 0.79, 0.84, 0.6),
  )
  if (check <= 0.055) return ACCENT
  const bars = [
    [0.2, 0.24, 0.8],
    [0.2, 0.43, 0.68],
    [0.2, 0.62, 0.48],
  ]
  for (const [left, top, right] of bars) {
    if (insideRoundedRect(x, y, left, top, right, top + 0.11, 0.055)) return WHITE
  }
  return BACKGROUND
}

function render(size) {
  const rows = []
  for (let py = 0; py < size; py += 1) {
    const row = Buffer.alloc(1 + size * 4)
    for (let px = 0; px < size; px += 1) {
      let r = 0
      let g = 0
      let b = 0
      let coverage = 0
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const color = shade(
            (px + (sx + 0.5) / SAMPLES) / size,
            (py + (sy + 0.5) / SAMPLES) / size,
          )
          if (!color) continue
          r += color[0]
          g += color[1]
          b += color[2]
          coverage += 1
        }
      }
      const offset = 1 + px * 4
      if (coverage > 0) {
        row[offset] = Math.round(r / coverage)
        row[offset + 1] = Math.round(g / coverage)
        row[offset + 2] = Math.round(b / coverage)
      }
      row[offset + 3] = Math.round((coverage / (SAMPLES * SAMPLES)) * 255)
    }
    rows.push(row)
  }
  return encodePng(size, size, Buffer.concat(rows))
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, raw) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(outDir, { recursive: true })
for (const size of SIZES) {
  writeFileSync(resolve(outDir, `icon-${size}.png`), render(size))
}
console.log(`icons written to ${outDir}`)
