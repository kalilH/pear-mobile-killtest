// Generates assets/keepalive.wav: a 5 s pure digital silence (amplitude 0.0)
// PCM waveform that loops seamlessly. Provides the OS background execution
// token for continuous background sync on iOS without playing any audible sound
// or interfering with microphone/camera recordings.
//
//   node scripts/gen-keepalive-audio.js

const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 8000
const SECONDS = 5
const samples = SAMPLE_RATE * SECONDS
// 100% digital zero (0x00) - mathematically pure silence
const data = Buffer.alloc(samples * 2)

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
console.log('Wrote pure digital silence to', out, 'size:', fs.statSync(out).size)
