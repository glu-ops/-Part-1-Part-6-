import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'

mkdirSync('public', { recursive: true })

// CRC32 table
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  CRC_TABLE[n] = c
}

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const tb = Buffer.from(type)
  const lb = Buffer.alloc(4)
  lb.writeUInt32BE(data.length)
  const crcInput = Buffer.concat([tb, data])
  const cb = Buffer.alloc(4)
  cb.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([lb, tb, data, cb])
}

function makePng(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // RGB

  // Raw scanlines: 1 filter byte + width*3 RGB bytes per row
  const rowSize = 1 + size * 3
  const raw = Buffer.alloc(size * rowSize, 0)

  for (let y = 0; y < size; y++) {
    const off = y * rowSize
    raw[off] = 0  // filter: None

    for (let x = 0; x < size; x++) {
      const cx = x - size / 2
      const cy = y - size / 2
      const dist = Math.sqrt(cx * cx + cy * cy) / (size / 2)

      // 深藍漸層背景 #0a1628，中心加一點 cyan 光暈
      const glow = Math.max(0, 1 - dist * 1.5)
      const pr = Math.round(10  + glow * 0  )   // R
      const pg = Math.round(22  + glow * 190)   // G  → #00d4ff cyan 的 G
      const pb = Math.round(40  + glow * 215)   // B

      raw[off + 1 + x * 3]     = Math.min(255, pr)
      raw[off + 1 + x * 3 + 1] = Math.min(255, pg)
      raw[off + 1 + x * 3 + 2] = Math.min(255, pb)
    }
  }

  const idat = chunk('IDAT', deflateSync(raw))
  const iend = chunk('IEND', Buffer.alloc(0))
  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend])
}

writeFileSync('public/icon-192.png', makePng(192))
writeFileSync('public/icon-512.png', makePng(512))
console.log('✓ icon-192.png and icon-512.png generated')
