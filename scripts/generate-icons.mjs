// Reproducible, dependency-free bitmap of the app's three-book mark.
import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
const size = 256
const raw = Buffer.alloc(size * (1 + size * 4))
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * (1 + size * 4) + 1 + x * 4
    const book = y >= 62 && y < 194 && ((x >= 57 && x < 84) || (x >= 99 && x < 126) || (x >= 144 && x < 174))
    const spine = y >= 168 && y < 174 && x >= 57 && x < 174
    const color = book ? (spine ? [76, 97, 68] : [174, 197, 160]) : [25, 29, 34]
    raw.set([...color, 255], i)
  }
}
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([header, body, crc])
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18)
const directory = new URL('../src-tauri/icons/', import.meta.url)
await mkdir(directory, { recursive: true })
await writeFile(new URL('icon.png', directory), png)
await writeFile(new URL('icon.ico', directory), Buffer.concat([ico, png]))
console.log('Generated MarkVault PNG and Windows ICO.')
