// Generates assets/keepalive.wav: a 10 s, near-inaudible 120 Hz hum (~ -54 dBFS)
// that loops seamlessly (integer number of cycles). Used by the iOS/Android
// background-audio keep-alive toggle in src/App.tsx. A non-zero signal is used
// instead of digital silence so the audio pipeline is genuinely "playing".
//
//   node scripts/gen-keepalive-audio.js

const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 8000
const SECONDS = 10
const FREQ = 120
const AMPLITUDE = 0.002

const samples = SAMPLE_RATE * SECONDS
const data = Buffer.alloc(samples * 2)
for (let i = 0; i < samples; i++) {
  const v = Math.round(Math.sin((2 * Math.PI * FREQ * i) / SAMPLE_RATE) * AMPLITUDE * 32767)
  data.writeInt16LE(v, i * 2)
}

const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + data.length, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16) // PCM chunk size
header.writeUInt16LE(1, 20) // PCM
header.writeUInt16LE(1, 22) // mono
header.writeUInt32LE(SAMPLE_RATE, 24)
header.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
header.writeUInt16LE(2, 32) // block align
header.writeUInt16LE(16, 34) // bits per sample
header.write('data', 36)
header.writeUInt32LE(data.length, 40)

const out = path.join(__dirname, '..', 'assets', 'keepalive.wav')
fs.writeFileSync(out, Buffer.concat([header, data]))
console.log('Wrote', out)
