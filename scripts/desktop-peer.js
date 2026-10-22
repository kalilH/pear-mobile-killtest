#!/usr/bin/env node
/* eslint-disable no-console */

// Desktop CLI companion peer for the PocketVault / P2P Kill-Test protocol.
// Can act as Device B (Host or Client) on a Windows / Mac / Linux laptop.
// Compatible with workers/main.js wire protocol.
//
// Usage:
//   node scripts/desktop-peer.js host [max|10m|5m|2m|256k]
//   node scripts/desktop-peer.js join <64-char-hex-topic>

const os = require('os')
const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')
const UDX = require('udx-native')
let udxBinding = null
try {
  udxBinding = require('udx-native/binding')
} catch {}

// Global crash guard
process.on('uncaughtException', (err) => {
  console.error('\n[FATAL UNCAUGHT EXCEPTION]', err && err.stack ? err.stack : err)
})

// Accelerated hole-punching for 5G Cellular / Symmetric CGNAT (Scenario B)
const Holepuncher = require('hyperdht/lib/holepuncher')
if (Holepuncher && Holepuncher.prototype) {
  Holepuncher.prototype._randomProbes = async function (remoteAddr) {
    let tries = 1750
    const HOLEPUNCH = b4a.from([0])
    while (this.punching && tries > 0) {
      const burst = Math.min(3, tries)
      tries -= burst
      for (let i = 0; i < burst; i++) {
        const port = (1000 + Math.random() * 64536) | 0
        try {
          this._holder.socket.send(HOLEPUNCH, port, remoteAddr.host, 64)
        } catch {}
      }
      if (this.punching) await this._sleeper.pause(8)
    }
    this._autoDestroy()
  }

  const origReopen = Holepuncher.prototype._reopen
  Holepuncher.prototype._reopen = function () {
    if (this.remoteFirewall >= 3) return Promise.resolve(false) // FIREWALL.RANDOM = 3, bypass useless 12s reopen delays
    return origReopen.call(this)
  }
}

const CHUNK_SIZE = 256 * 1024
const HEADER_SIZE = 1 + 8 + 4
const DISCOVERY_PORT = 49739
const T_CHUNK = 0x01
const T_PING = 0x02
const T_PONG = 0x03
const T_LAN_HINT = 0x04
const TARGET_BYTES = 500 * 1024 * 1024

const BOOTSTRAP_NODES = [
  { host: '88.99.3.86', port: 49737 },
  { host: '142.93.90.113', port: 49737 },
  { host: '138.68.147.8', port: 49737 }
]

const SPEED_RATES = {
  '256k': 256 * 1024,
  '2m': 2 * 1024 * 1024,
  '5m': 5 * 1024 * 1024,
  '10m': 10 * 1024 * 1024,
  max: 0
}

const args = process.argv.slice(2)
const mode = args[0]?.toLowerCase()

if (!mode || (mode !== 'host' && mode !== 'join')) {
  console.log(`
PocketVault Sync - Desktop CLI Peer (Device B)

Usage:
  node scripts/desktop-peer.js host [speed]     # Act as Host (Peer A / Sender)
  node scripts/desktop-peer.js join <topic>     # Act as Client (Peer B / Receiver)

Speeds: max (default), 10m, 5m, 2m, 256k
Example:
  node scripts/desktop-peer.js host max
  node scripts/desktop-peer.js join 4a8b...64hex
  node scripts/desktop-peer.js join 4a8b...64hex@192.168.43.1:49738
`)
  process.exit(1)
}

let topic = null
let speedMode = 'max'
let directHint = null
const swarm = new Hyperswarm({
  bootstrap: BOOTSTRAP_NODES,
  backoffs: [150, 300, 600, 1200],
  jitter: 50,
  maxParallel: 5
})

if (mode === 'host') {
  topic = swarm.keyPair.publicKey
  speedMode = (args[1] || 'max').toLowerCase()
  if (!SPEED_RATES[speedMode] && speedMode !== 'max') speedMode = 'max'
} else {
  let hex = (args[1] || '').trim().toLowerCase()
  if (hex.includes('@')) {
    const parts = hex.split('@')
    hex = parts[0]
    const hp = parts[1].split(':')
    if (hp[0] && hp[1]) {
      directHint = { host: hp[0], port: parseInt(hp[1], 10) }
    }
  }
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    console.error('ERROR: Topic must be a 64-character hexadecimal string (optional @ip:port).')
    process.exit(1)
  }
  topic = b4a.from(hex, 'hex')
}

const topicHex = b4a.toString(topic, 'hex')

const localIps = []
const ifaces = os.networkInterfaces()
for (const ifname of Object.keys(ifaces)) {
  for (const net of ifaces[ifname] || []) {
    if (net.family === 'IPv4' && !net.internal) {
      localIps.push({ iface: ifname, ip: net.address })
    }
  }
}

let activeSocket = null
let totalBytes = 0
let totalChunks = 0
let windowBytes = 0
let windowStart = Date.now()
let rttMs = null
let seq = 0
let lastSeq = -1
let gaps = 0
let disconnects = 0
let targetReached = false
let needsDrain = false
let streamTimer = null
let beaconTimer = null
let beaconSock = null
let remoteInfo = null
let connectedAt = 0
let lastHeartbeat = 0
let triggerBroadcast = null
let discovery = null
const POOL_SIZE = 8
const chunkPool = []
const chunkTemplate = crypto.randomBytes(CHUNK_SIZE - HEADER_SIZE)
for (let i = 0; i < POOL_SIZE; i++) {
  const buf = b4a.alloc(CHUNK_SIZE)
  buf[0] = T_CHUNK
  buf.set(chunkTemplate, HEADER_SIZE)
  chunkPool.push(buf)
}
let poolIndex = 0

function getNextChunk(socket) {
  let buf = null
  if (socket && typeof socket.alloc === 'function') {
    buf = socket.alloc(CHUNK_SIZE)
  } else {
    buf = chunkPool[poolIndex++ % POOL_SIZE]
  }
  buf[0] = T_CHUNK
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  view.setFloat64(1, Date.now())
  view.setUint32(9, seq++)
  buf.set(chunkTemplate, HEADER_SIZE)
  return buf
}

async function startPeer() {
  let boundPort = 49737
  if (mode === 'host') {
    await swarm.listen()
    const addr = swarm.dht.io?.serverSocket?.address()
    boundPort = addr ? addr.port : 49737
  }

  console.log('='.repeat(65))
  console.log(`  POCKETVAULT SYNC KILL-TEST - DESKTOP PEER (${mode.toUpperCase()})`)
  console.log('='.repeat(65))
  console.log(`Topic Key (Pure 5G/WAN):`)
  console.log(`\x1b[36m\x1b[1m${topicHex}\x1b[0m`)
  if (mode === 'host') {
    console.log(`\nDirect Hotspot / LAN Keys (Instant Zero-Internet Sync):`)
    if (localIps.length === 0) {
      console.log(`  \x1b[32m\x1b[1m${topicHex}@127.0.0.1:${boundPort}\x1b[0m`)
    } else {
      for (const item of localIps) {
        console.log(`  [${item.iface}] \x1b[32m\x1b[1m${topicHex}@${item.ip}:${boundPort}\x1b[0m`)
      }
    }
    console.log(
      `\n\x1b[33mTip for 5G Cellular Speed:\x1b[0m Forward UDP port ${boundPort} in router for instant (<500ms) connection!`
    )
  }
  console.log(`\nSpeed Profile: ${speedMode.toUpperCase()}`)
  console.log('='.repeat(65))

  // Local UDP Subnet Beacon with Auto-Switching between Online and Offline WLAN
  const udx = new UDX()
  try {
    beaconSock = udx.createSocket({ reuseAddress: true })
    beaconSock.on('error', (err) => console.log(`[Beacon] socket notice: ${err.message}`))
    beaconSock.bind(DISCOVERY_PORT)
  } catch (err) {
    console.log(`[Beacon] bind notice: ${err.message}`)
  }

  function getSubnetTargets() {
    const targets = new Set(['255.255.255.255', '224.0.0.1'])
    try {
      const ifacesList = os.networkInterfaces()
      for (const dev of Object.keys(ifacesList)) {
        for (const net of ifacesList[dev] || []) {
          if (net.family === 'IPv4' && !net.internal && net.address) {
            const parts = net.address.split('.')
            if (parts.length === 4) {
              targets.add(`${parts[0]}.${parts[1]}.${parts[2]}.255`)
            }
          }
        }
      }
    } catch {}
    return Array.from(targets)
  }

  function broadcastBeacon() {
    if (!beaconSock) return
    const targets = getSubnetTargets()
    let payload = null
    if (mode === 'host') {
      const port = swarm.dht.io?.serverSocket?.address()?.port || boundPort
      payload = b4a.from(JSON.stringify({ pv: '1', role: 'host', k: topicHex, p: port }))
    } else {
      payload = b4a.from(JSON.stringify({ pv: '1', role: 'client', k: topicHex }))
    }
    for (const target of targets) {
      try {
        beaconSock.send(payload, DISCOVERY_PORT, target)
      } catch {}
    }
  }

  if (beaconSock) {
    beaconSock.on('message', (buf, rinfo) => {
      let data = null
      try {
        data = JSON.parse(b4a.toString(buf))
      } catch {
        return
      }
      if (!data || data.k !== topicHex) return

      // If Host receives Client discovery ping on LAN:
      if (mode === 'host' && (data.role === 'client' || !data.role)) {
        const port = swarm.dht.io?.serverSocket?.address()?.port || boundPort
        const reply = b4a.from(JSON.stringify({ pv: '1', role: 'host', k: topicHex, p: port }))
        try {
          beaconSock.send(reply, DISCOVERY_PORT, rinfo.host)
        } catch {}
      }

      // If Client receives Host announcement on LAN:
      if (mode === 'join' && (data.role === 'host' || data.p) && data.p) {
        if (!activeSocket) {
          console.log(
            `\n\x1b[32m[Auto-Switch]\x1b[0m Discovered peer on local WLAN at ${rinfo.host}:${data.p}! Connecting...`
          )
          const peerInfo = swarm.peers.get(topicHex)
          if (peerInfo) {
            peerInfo.attempts = 0
            peerInfo.banned = false
            peerInfo.tried = false
          }
          swarm._handlePeer(
            {
              publicKey: topic,
              relayAddresses: [{ host: rinfo.host, port: data.p }]
            },
            topic
          )
        }
      }
    })
  }

  // Periodic beacon: every 1500ms when not connected
  beaconTimer = setInterval(() => {
    if (!activeSocket) {
      broadcastBeacon()
    }
  }, 1500)

  // Immediate discovery ping
  triggerBroadcast = broadcastBeacon
  broadcastBeacon()

  if (directHint) {
    console.log(
      `\x1b[32m[Direct]\x1b[0m Connecting directly to provided hint ${directHint.host}:${directHint.port}...`
    )
    swarm._handlePeer(
      {
        publicKey: topic,
        relayAddresses: [directHint]
      },
      topic
    )
  }

  console.log('Initializing Hyperswarm DHT (Direct IP Bootstraps)...')

  swarm.dht
    .ready()
    .then(() => {
      const d = swarm.dht
      if (d.socket) {
        try {
          d.socket.setSendBufferSize(4 * 1024 * 1024)
          d.socket.setRecvBufferSize(4 * 1024 * 1024)
        } catch {}
      }
      console.log(
        `DHT Ready. Public: ${d.host || '?'}:${d.port || '?'} | Firewalled: ${d.firewalled} | Randomized NAT: ${d.randomized}`
      )
    })
    .catch((err) => {
      console.error('DHT Init Error:', err.message)
    })

  discovery = swarm.join(
    topic,
    mode === 'host' ? { server: true, client: true } : { server: false, client: true }
  )
  discovery.flushed().then(() => {
    console.log(`DHT announce flushed. Waiting for peer connection...`)
  })
}

startPeer().catch(console.error)

function frame(type, ts, s, payloadSize) {
  const buf = b4a.alloc(HEADER_SIZE + payloadSize)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  view.setUint8(0, type)
  view.setFloat64(1, ts)
  view.setUint32(9, s)
  return buf
}

function tuneSocket(socket) {
  const HWM = 2 * 1024 * 1024
  if (socket._writableState) socket._writableState.highWaterMark = HWM
  if (socket._readableState) socket._readableState.highWaterMark = HWM
  const raw = socket.rawStream
  if (raw) {
    if (raw._writableState) raw._writableState.highWaterMark = HWM
    if (raw._readableState) raw._readableState.highWaterMark = HWM
    if (raw.socket) {
      try {
        raw.socket.setSendBufferSize(8 * 1024 * 1024)
        raw.socket.setRecvBufferSize(8 * 1024 * 1024)
      } catch {}
    }
  }
}

swarm.on('connection', (socket, info) => {
  tuneSocket(socket)
  const raw = socket.rawStream
  const remote = {
    host: (raw && raw.remoteHost) || '?',
    port: (raw && raw.remotePort) || 0,
    publicKey: b4a.toString(info.publicKey, 'hex').slice(0, 12),
    client: !!info.client,
    relayed: !!(socket.relay || (raw && raw.relayed))
  }

  if (activeSocket) {
    console.log(`[Swarm] Ignored extra connection from ${remote.host}:${remote.port}`)
    socket.on('error', () => {})
    return socket.destroy()
  }

  activeSocket = socket
  remoteInfo = remote
  connectedAt = Date.now()
  lastHeartbeat = connectedAt
  needsDrain = false
  windowBytes = 0
  windowStart = Date.now()
  const linkType = remote.relayed
    ? 'CONNECTED_RELAYED (Fallback Relay)'
    : 'CONNECTED_DIRECT (P2P Direct)'

  console.log('\n' + '*'.repeat(65))
  console.log(`\x1b[32m\x1b[1m>>> PEER STREAM CONNECTED!\x1b[0m`)
  console.log(`Remote: ${remote.host}:${remote.port} (Client: ${remote.client})`)
  console.log(`Link Type: \x1b[33m\x1b[1m${linkType}\x1b[0m`)
  console.log('*'.repeat(65) + '\n')

  socket.setKeepAlive?.(5000)

  socket.on('drain', () => {
    needsDrain = false
    if (mode === 'host') {
      if (speedMode === 'max') pumpReplenish()
      else pump()
    }
  })

  socket.on('data', (data) => onData(socket, data))

  socket.on('error', (err) => {
    console.log(`\x1b[31m[Socket Error]\x1b[0m ${err.code || err.message}`)
  })

  socket.on('close', () => {
    activeSocket = null

    if (streamTimer) {
      clearInterval(streamTimer)
      streamTimer = null
    }
    const upTime = ((Date.now() - connectedAt) / 1000).toFixed(1)
    connectedAt = 0
    needsDrain = false
    disconnects++
    console.log(
      `\n\x1b[31m[Disconnected]\x1b[0m Stream dropped after ${upTime}s (Drop #${disconnects}). Auto-switch seeking on LAN/WAN...`
    )

    // Reset attempts on peer so Hyperswarm doesn't de-prioritize or lock out reconnection
    for (const peerInfo of swarm.peers.values()) {
      peerInfo.attempts = 0
      peerInfo.banned = false
      peerInfo.tried = false
    }

    if (triggerBroadcast) triggerBroadcast()
    if (discovery) discovery.refresh().catch(() => {})
  })

  if (mode === 'host') {
    startHostPumping()
    if (localIps.length > 0) {
      const boundPort = swarm.dht.io?.serverSocket?.address()?.port || 49737
      const payloadStr = JSON.stringify({ ips: localIps.map((x) => x.ip), port: boundPort })
      const payloadBuf = b4a.from(payloadStr)
      const hintFrame = frame(T_LAN_HINT, Date.now(), 0, payloadBuf.byteLength)
      hintFrame.set(payloadBuf, HEADER_SIZE)
      socket.write(hintFrame)
    }
  }
})

function onData(socket, data) {
  if (data.byteLength < HEADER_SIZE) return
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const type = view.getUint8(0)
  const ts = view.getFloat64(1)
  const s = view.getUint32(9)

  if (type === T_CHUNK) {
    const payload = data.byteLength - HEADER_SIZE
    totalBytes += payload
    windowBytes += payload
    totalChunks++
    if (lastSeq >= 0 && s > lastSeq + 1) gaps += s - lastSeq - 1
    lastSeq = Math.max(lastSeq, s)
    lastHeartbeat = Date.now()
    if (!targetReached && totalBytes >= TARGET_BYTES) {
      targetReached = true
      console.log(`\n\x1b[32m\x1b[1m[SUCCESS] Reached 500 MB transfer target!\x1b[0m\n`)
    }
  } else if (type === T_PING) {
    lastHeartbeat = Date.now()
    socket.write(frame(T_PONG, ts, s, 0))
  } else if (type === T_PONG) {
    lastHeartbeat = Date.now()
    rttMs = Math.round(Date.now() - ts)
  } else if (type === T_LAN_HINT) {
    if (
      mode === 'join' &&
      !remoteInfo?.host?.startsWith('192.168.') &&
      !remoteInfo?.host?.startsWith('10.')
    ) {
      try {
        const payloadBuf = data.subarray(HEADER_SIZE)
        const hint = JSON.parse(b4a.toString(payloadBuf))
        if (hint && Array.isArray(hint.ips) && hint.port) {
          for (const ip of hint.ips) {
            const subnet = ip.split('.').slice(0, 3).join('.')
            const localMatch = localIps.some((l) => l.ip.startsWith(subnet))
            if (localMatch) {
              console.log(
                `\n\x1b[32m[Auto-Upgrade]\x1b[0m Same Wi-Fi detected! Migrating connection to LAN IP ${ip}:${hint.port}...`
              )
              swarm._handlePeer(
                { publicKey: topic, relayAddresses: [{ host: ip, port: hint.port }] },
                topic
              )
              break
            }
          }
        }
      } catch {}
    }
  }
}

let rateStart = 0
let rateBytes = 0

let smoothedThroughput = 0
let isPumping = false

const HWM_BYTES = 2 * 1024 * 1024

function startHostPumping() {
  rateStart = 0
  rateBytes = 0
  needsDrain = false
  if (streamTimer) clearInterval(streamTimer)
  if (speedMode === 'max') {
    streamTimer = setInterval(() => pumpReplenish(), 4)
    pumpReplenish()
  } else {
    streamTimer = setInterval(() => pump(), 10)
    pump()
  }
}

function pumpReplenish() {
  if (!activeSocket || targetReached || isPumping) return
  isPumping = true
  const payload = CHUNK_SIZE - HEADER_SIZE

  while (
    !targetReached &&
    (!activeSocket._writableState || activeSocket._writableState.buffered < HWM_BYTES)
  ) {
    const buf = getNextChunk(activeSocket)
    totalBytes += payload
    windowBytes += payload
    totalChunks++
    if (totalBytes >= TARGET_BYTES) {
      targetReached = true
      console.log(
        `\n\x1b[32m\x1b[1m[SUCCESS] Sent 500 MB target! Keeping heartbeats active...\x1b[0m\n`
      )
      activeSocket.write(buf)
      break
    }
    if (activeSocket.write(buf) === false) {
      break
    }
  }
  isPumping = false
}

function pump() {
  if (!activeSocket || targetReached || needsDrain) return
  const payload = CHUNK_SIZE - HEADER_SIZE

  const targetBps = SPEED_RATES[speedMode] || SPEED_RATES['256k']
  const now = Date.now()
  if (!rateStart) {
    rateStart = now
    rateBytes = 0
  }
  const elapsedSec = (now - rateStart) / 1000
  const allowedBytes = elapsedSec * targetBps

  while (rateBytes < allowedBytes && !targetReached && !needsDrain) {
    const buf = getNextChunk(activeSocket)
    totalBytes += payload
    windowBytes += payload
    rateBytes += payload
    totalChunks++
    if (totalBytes >= TARGET_BYTES) {
      targetReached = true
      console.log(`\n\x1b[32m\x1b[1m[SUCCESS] Sent 500 MB target!\x1b[0m\n`)
      activeSocket.write(buf)
      break
    }
    if (activeSocket.write(buf) === false) {
      needsDrain = true
      break
    }
  }

  if (elapsedSec > 5) {
    rateStart = now
    rateBytes = 0
  }
}

// Host Ping interval
if (mode === 'host') {
  setInterval(() => {
    if (activeSocket) {
      activeSocket.write(frame(T_PING, Date.now(), seq, 0))
    }
  }, 1000)
}

let lastWireBytes = 0

// Periodic Telemetry Dashboard in console
setInterval(() => {
  const now = Date.now()
  const elapsed = (now - windowStart) / 1000
  const raw = activeSocket?.rawStream
  const currentWire =
    mode === 'host' ? raw?.bytesTransmitted || totalBytes : raw?.bytesReceived || totalBytes
  const wireDelta = lastWireBytes > 0 ? Math.max(0, currentWire - lastWireBytes) : 0
  lastWireBytes = currentWire

  const throughput = elapsed > 0 && wireDelta > 0 ? wireDelta / elapsed : windowBytes / elapsed
  smoothedThroughput =
    smoothedThroughput === 0 ? throughput : smoothedThroughput * 0.7 + throughput * 0.3
  windowBytes = 0
  windowStart = now

  const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1)
  const mbSec = (throughput / (1024 * 1024)).toFixed(2)
  const avgMbSec = (smoothedThroughput / (1024 * 1024)).toFixed(2)
  const realRtt = (activeSocket && activeSocket.rawStream && activeSocket.rawStream.rtt) || rttMs
  const rttStr = realRtt !== null ? `${realRtt}ms` : '--'
  const remoteHost = remoteInfo?.host || '?'
  const isLan =
    remoteHost.startsWith('192.168.') ||
    remoteHost.startsWith('10.') ||
    remoteHost.startsWith('172.') ||
    remoteHost === '127.0.0.1'
  const routeTag = isLan ? '\x1b[32m[LAN Direct]\x1b[0m' : `\x1b[33m[WAN ${remoteHost}]\x1b[0m`

  const bbrBw = raw?.bbrBandwidth ? `${(raw.bbrBandwidth / (1024 * 1024)).toFixed(1)} MB/s` : '--'
  const cwndStr = raw?.cwnd ? String(raw.cwnd) : '--'

  process.stdout.write(
    `\r[${new Date().toLocaleTimeString()}] ${routeTag} | Sent: ${mbTotal} MB | Inst: ${mbSec} MB/s | Avg: ${avgMbSec} MB/s | BBR: ${bbrBw.padEnd(8)} | CWND: ${cwndStr.padEnd(6)} | RTT: ${rttStr.padEnd(5)} | Retx: ${raw?.retransmits || 0} `
  )
}, 1000)

process.on('SIGINT', async () => {
  console.log('\nClosing swarm and exiting...')
  if (streamTimer) clearInterval(streamTimer)
  if (beaconTimer) clearInterval(beaconTimer)
  if (beaconSock) {
    try {
      beaconSock.close()
    } catch {}
  }
  await swarm.destroy()
  process.exit(0)
})
