/* global Bare, BareKit */

// P2P kill-test worklet.
//
// Runs inside react-native-bare-kit. Talks to React Native over the BareKit IPC
// duplex, framed with FramedStream; every frame is a UTF-8 JSON object.
//
//   RN -> worklet: { type: 'host' } | { type: 'join', topic } | { type: 'stop' }
//   worklet -> RN: { type: 'ready' } | { type: 'topic', topic, mode }
//                  { type: 'telemetry', ...stats } | { type: 'log', t, msg }
//                  { type: 'error', msg }
//
// Peer wire protocol (one secret-stream message == one frame, secret-stream
// preserves message boundaries so no extra framing is needed):
//   [u8 type][f64 timestamp][u32 seq][payload...]
//   0x01 CHUNK      host -> join, 64 KiB total, every 250 ms
//   0x02 PING       host -> join, every 1 s
//   0x03 PONG       join -> host, echoes the PING timestamp (RTT measurement)

const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')
const FramedStream = require('framed-stream')
const UDX = require('udx-native')
const udx = new UDX()
let udxBinding = null
try {
  udxBinding = require('udx-native/binding')
} catch {}

// Global crash guard for BareKit worklet
if (typeof Bare !== 'undefined' && Bare.on) {
  Bare.on('uncaughtException', (err) => {
    try {
      log(`FATAL UNCAUGHT: ${err && err.stack ? err.stack : err}`)
    } catch {}
  })
}

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
const DISCOVERY_PORT = 49739
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
const PING_INTERVAL_MS = 1000
const TELEMETRY_INTERVAL_MS = 1000
const TARGET_BYTES = 500 * 1024 * 1024
const STALL_MS = 5000
const HEADER_SIZE = 1 + 8 + 4

const T_CHUNK = 0x01
const T_PING = 0x02
const T_PONG = 0x03
const T_LAN_HINT = 0x04

const IPC = (typeof BareKit !== 'undefined' && BareKit.IPC) || Bare.IPC
const pipe = new FramedStream(IPC)

let session = null

// ---------------------------------------------------------------------------
// IPC helpers

function send(obj) {
  try {
    pipe.write(JSON.stringify(obj))
  } catch {
    // pipe gone (RN side reloaded) - nothing useful to do
  }
}

function log(msg) {
  send({ type: 'log', t: Date.now(), msg })
}

pipe.on('data', (data) => {
  let msg = null
  try {
    msg = JSON.parse(b4a.toString(data))
  } catch {
    return log('Ignored malformed IPC frame')
  }
  onCommand(msg).catch((err) => send({ type: 'error', msg: err.message }))
})

pipe.on('error', () => {})

function onCommand(msg) {
  if (msg.type === 'host') return start('host', null, msg.speedMode || 'max')
  if (msg.type === 'join') return start('join', msg.topic)
  if (msg.type === 'setSpeed') return setSpeed(msg.speedMode || 'max')
  if (msg.type === 'stop') return stop()
  return Promise.resolve()
}

// ---------------------------------------------------------------------------
// Process lifecycle visibility (this is what the kill test is about)

Bare.on('suspend', (linger) => log(`Bare worklet SUSPEND (linger=${linger})`))
Bare.on('idle', () => log('Bare worklet IDLE (event loop parked)'))
Bare.on('wakeup', (deadline) => log(`Bare worklet WAKEUP (deadline=${deadline})`))
Bare.on('resume', () => log('Bare worklet RESUME'))

// Event-loop freeze detector: if a 1 s interval fires much later than expected,
// the OS froze the process (screen lock / background) for that long.
let lastTick = Date.now()
setInterval(() => {
  const now = Date.now()
  const gap = now - lastTick - 1000
  lastTick = now
  if (gap > 2000) log(`Event loop FROZEN for ${(gap / 1000).toFixed(1)}s (OS suspended process?)`)
}, 1000)

// ---------------------------------------------------------------------------
// Session

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

async function start(mode, topicHex, speedMode = 'max') {
  if (session) await stop()

  let topic = null
  let directHint = null
  const swarm = new Hyperswarm({
    bootstrap: BOOTSTRAP_NODES,
    backoffs: [150, 300, 600, 1200],
    jitter: 50,
    maxParallel: 5
  })

  if (mode === 'host') {
    topic = swarm.keyPair.publicKey
  } else {
    let cleanHex = String(topicHex || '')
      .trim()
      .toLowerCase()
    if (cleanHex.includes('@')) {
      const parts = cleanHex.split('@')
      cleanHex = parts[0]
      const hp = parts[1].split(':')
      if (hp[0] && hp[1]) {
        directHint = { host: hp[0], port: parseInt(hp[1], 10) }
      }
    }
    if (!/^[0-9a-f]{64}$/.test(cleanHex)) {
      send({ type: 'error', msg: 'Topic key must be 64 hex characters (optional @ip:port)' })
      try {
        await swarm.destroy()
      } catch {}
      return
    }
    topic = b4a.from(cleanHex, 'hex')
  }

  const s = {
    mode,
    speedMode,
    rateStart: 0,
    rateBytes: 0,
    streamTimer: null,
    topic,
    topicHex: b4a.toString(topic, 'hex'),
    swarm,
    discovery: null,
    socket: null,
    remote: null,
    beaconSocket: null,
    beaconTimer: null,
    startedAt: Date.now(),
    firstConnectAt: 0,
    connectedAt: 0,
    bytes: 0, // sent (host) or received (join), payload of chunks only
    chunks: 0,
    dropped: 0, // host: chunks skipped because of backpressure
    needsDrain: false,
    punching: false,
    seq: 0,
    lastSeq: -1,
    gaps: 0, // join: missing sequence numbers
    lastHeartbeat: 0,
    rttMs: null,
    disconnects: 0,
    winBytes: 0,
    winStart: Date.now(),
    throughput: 0,
    lastWireBytes: 0,
    targetReached: false,
    timers: []
  }
  session = s

  send({ type: 'topic', topic: s.topicHex, mode })
  log(
    `Mode ${mode.toUpperCase()} - topic ${s.topicHex.slice(0, 8)}... (profile: ${speedMode.toUpperCase()})`
  )

  s.swarm.on('connection', (socket, info) => onConnection(s, socket, info))
  s.swarm.on('update', () => {
    if (session !== s) return
    const punching = !s.socket && s.swarm.connecting > 0
    if (punching && !s.punching) {
      log(
        `Peer found, hole-punching (attempts=${s.swarm.connecting}, +${Date.now() - s.startedAt}ms)`
      )
    }
    s.punching = punching
  })

  // Local UDP Subnet Beacon for instant zero-internet & auto-switching
  let beaconSock = null
  try {
    beaconSock = udx.createSocket({ reuseAddress: true })
    beaconSock.on('error', (err) => log(`Beacon socket notice: ${err.message}`))
    beaconSock.bind(DISCOVERY_PORT)
    s.beaconSocket = beaconSock
  } catch (err) {
    log(`Beacon bind notice: ${err.message}`)
  }

  function getSubnetTargets() {
    const targets = new Set(['255.255.255.255', '224.0.0.1'])
    try {
      const ifaces = udx.networkInterfaces()
      for (const iface of ifaces) {
        if (iface.family === 4 && !iface.internal && iface.host) {
          const parts = iface.host.split('.')
          if (parts.length === 4) {
            targets.add(`${parts[0]}.${parts[1]}.${parts[2]}.255`)
          }
        }
      }
    } catch {}
    return Array.from(targets)
  }

  function broadcastBeacon() {
    if (session !== s || !beaconSock) return
    const targets = getSubnetTargets()
    let payload = null
    if (s.mode === 'host') {
      const port = s.swarm.dht.io?.serverSocket?.address()?.port || 49737
      payload = b4a.from(JSON.stringify({ pv: '1', role: 'host', k: s.topicHex, p: port }))
    } else {
      payload = b4a.from(JSON.stringify({ pv: '1', role: 'client', k: s.topicHex }))
    }
    for (const target of targets) {
      try {
        beaconSock.send(payload, DISCOVERY_PORT, target)
      } catch {}
    }
  }
  s.broadcastBeacon = broadcastBeacon

  if (beaconSock) {
    beaconSock.on('message', (buf, rinfo) => {
      if (session !== s) return
      let data = null
      try {
        data = JSON.parse(b4a.toString(buf))
      } catch {
        return
      }
      if (!data || data.k !== s.topicHex) return

      // If we are Host and receive a discovery ping from a Client on LAN:
      if (s.mode === 'host' && (data.role === 'client' || !data.role)) {
        const port = s.swarm.dht.io?.serverSocket?.address()?.port || 49737
        const reply = b4a.from(JSON.stringify({ pv: '1', role: 'host', k: s.topicHex, p: port }))
        try {
          beaconSock.send(reply, DISCOVERY_PORT, rinfo.host)
        } catch {}
      }

      // If we are Client and receive a Host announcement on LAN:
      if (s.mode === 'join' && (data.role === 'host' || data.p) && data.p) {
        if (!s.socket) {
          const peerInfo = s.swarm.peers.get(s.topicHex)
          if (peerInfo) {
            peerInfo.attempts = 0
            peerInfo.banned = false
            peerInfo.tried = false
          }
          log(
            `Auto-switch: Discovered peer on local WLAN at ${rinfo.host}:${data.p}! Connecting...`
          )
          s.swarm._handlePeer(
            {
              publicKey: s.topic,
              relayAddresses: [{ host: rinfo.host, port: data.p }]
            },
            s.topic
          )
        }
      }
    })
  }

  // Periodic beacon: every 1500ms when not connected (pauses when connected)
  s.beaconTimer = setInterval(() => {
    if (session !== s) return
    if (!s.socket) {
      broadcastBeacon()
    }
  }, 1500)

  if (mode === 'host') {
    s.swarm
      .listen()
      .then(() => {
        if (session !== s) return
        const addr = s.swarm.dht.io?.serverSocket?.address()
        const port = addr ? addr.port : 49737
        let localIp = null
        try {
          const ifaces = udx.networkInterfaces()
          for (const iface of ifaces) {
            if (iface.family === 4 && !iface.internal) {
              localIp = iface.host
              break
            }
          }
        } catch {}
        const directKey = localIp ? `${s.topicHex}@${localIp}:${port}` : null
        send({ type: 'topic', topic: s.topicHex, directKey, mode })
        if (directKey) {
          log(`Direct Hotspot/LAN Key: ${directKey}`)
        }
        broadcastBeacon()
        log(`Hotspot/WLAN auto-discovery active on port ${DISCOVERY_PORT}`)
      })
      .catch(() => {})
  } else {
    // Client mode: broadcast immediate discovery request on WLAN
    broadcastBeacon()
    if (directHint) {
      log(
        `Direct hint provided: ${directHint.host}:${directHint.port}! Initiating direct P2P connection...`
      )
      s.swarm._handlePeer(
        {
          publicKey: s.topic,
          relayAddresses: [directHint]
        },
        s.topic
      )
    }
  }

  log('Bootstrapping DHT...')
  const tDht = Date.now()
  s.swarm.dht
    .ready()
    .then(() => {
      if (session !== s) return
      const d = s.swarm.dht
      if (d.socket) {
        try {
          d.socket.setSendBufferSize(2 * 1024 * 1024)
          d.socket.setRecvBufferSize(2 * 1024 * 1024)
        } catch {}
      }
      log(
        `DHT ready in ${Date.now() - tDht}ms - public ${d.host || '?'}:${d.port || '?'} ` +
          `firewalled=${d.firewalled} randomizedNAT=${d.randomized}`
      )
    })
    .catch((err) => log(`DHT ready failed: ${err.message}`))

  const tJoin = Date.now()
  s.discovery = s.swarm.join(
    topic,
    mode === 'host' ? { server: true, client: true } : { server: false, client: true }
  )
  s.discovery
    .flushed()
    .then(() => {
      if (session !== s) return
      log(
        mode === 'host'
          ? `Topic announced on DHT in ${Date.now() - tJoin}ms`
          : `DHT lookup flushed in ${Date.now() - tJoin}ms`
      )
    })
    .catch((err) => log(`Discovery flush failed: ${err.message}`))

  s.timers.push(setInterval(() => telemetry(s), TELEMETRY_INTERVAL_MS))
  s.timers.push(
    setInterval(() => {
      if (session !== s) return
      // Rapid recovery watchdog: never interrupt active hole-punching
      if (!s.socket && s.swarm.connecting === 0 && s.discovery) {
        for (const peerInfo of s.swarm.peers.values()) {
          peerInfo.attempts = 0
          peerInfo.banned = false
          peerInfo.tried = false
        }
        s.discovery.refresh().catch(() => {})
      }
    }, 3000)
  )
  if (mode === 'host') {
    s.timers.push(setInterval(() => sendPing(s), PING_INTERVAL_MS))
  }
  telemetry(s)
}

async function stop() {
  const s = session
  if (!s) return
  session = null
  if (s.streamTimer) {
    clearInterval(s.streamTimer)
    s.streamTimer = null
  }
  if (s.beaconTimer) {
    clearInterval(s.beaconTimer)
    s.beaconTimer = null
  }
  if (s.beaconSocket) {
    try {
      s.beaconSocket.close()
    } catch {}
    s.beaconSocket = null
  }
  for (const t of s.timers) clearInterval(t)
  log('Stopping session, destroying swarm...')
  try {
    await s.swarm.destroy()
  } catch (err) {
    log(`Swarm destroy error: ${err.message}`)
  }
  send({ type: 'telemetry', state: 'Idle', mode: null })
  log('Session stopped')
}

// ---------------------------------------------------------------------------
// Connection handling

function onConnection(s, socket, info) {
  if (session !== s) return socket.destroy()

  tuneSocket(socket)
  const raw = socket.rawStream
  const remote = {
    host: (raw && raw.remoteHost) || '?',
    port: (raw && raw.remotePort) || 0,
    publicKey: b4a.toString(info.publicKey, 'hex').slice(0, 12),
    client: !!info.client,
    relayed: !!(socket.relay || (raw && raw.relayed))
  }

  if (s.socket) {
    log(`Extra connection from ${remote.host}:${remote.port} ignored`)
    socket.on('error', () => {})
    return socket.destroy()
  }

  const now = Date.now()
  s.socket = socket
  s.remote = remote
  s.connectedAt = now
  s.lastHeartbeat = now
  s.needsDrain = false
  s.winBytes = 0
  s.winStart = now
  if (!s.firstConnectAt) {
    s.firstConnectAt = now
    log(`First connection ${now - s.startedAt}ms after joining`)
  }

  log(
    `CONNECTED ${remote.relayed ? 'via RELAY' : 'direct P2P'} to ${remote.host}:${remote.port} ` +
      `(peer ${remote.publicKey}..., role: ${remote.client ? 'client' : 'server'})`
  )

  socket.setKeepAlive?.(5000)

  s.needsDrain = false
  socket.on('drain', () => {
    s.needsDrain = false
    if (s.mode === 'host') {
      if (s.speedMode === 'max') pumpReplenish(s)
      else pump(s)
    }
  })
  socket.on('data', (data) => onPeerData(s, socket, data))
  socket.on('error', (err) => log(`Socket error: ${err.code || err.message}`))
  socket.on('close', () => {
    s.socket = null

    if (s.streamTimer) {
      clearInterval(s.streamTimer)
      s.streamTimer = null
    }
    const up = ((Date.now() - s.connectedAt) / 1000).toFixed(1)
    s.connectedAt = 0
    s.disconnects++
    log(`DISCONNECTED after ${up}s (drop #${s.disconnects}) - auto-switch seeking on LAN/WAN`)

    // Reset attempts so Hyperswarm doesn't de-prioritize or lock out the peer
    for (const peerInfo of s.swarm.peers.values()) {
      peerInfo.attempts = 0
      peerInfo.banned = false
      peerInfo.tried = false
    }

    // Trigger immediate local subnet discovery ping
    if (s.broadcastBeacon) s.broadcastBeacon()

    // Refresh DHT in case peer moved to WAN
    if (s.discovery) s.discovery.refresh().catch(() => {})

    telemetry(s)
  })

  if (s.mode === 'host') {
    let localIp = null
    try {
      const ifaces = udx.networkInterfaces()
      for (const iface of ifaces) {
        if (iface.family === 4 && !iface.internal && iface.host) {
          localIp = iface.host
          break
        }
      }
    } catch {}
    if (localIp) {
      const boundPort = s.swarm.dht.io?.serverSocket?.address()?.port || 49737
      const payloadStr = JSON.stringify({ ips: [localIp], port: boundPort })
      const payloadBuf = b4a.from(payloadStr)
      const hintFrame = frame(T_LAN_HINT, Date.now(), 0, payloadBuf.byteLength)
      hintFrame.set(payloadBuf, HEADER_SIZE)
      socket.write(hintFrame)
    }
    applySpeedMode(s)
  }

  telemetry(s)
}

function onPeerData(s, socket, data) {
  if (data.byteLength < HEADER_SIZE) return
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const type = view.getUint8(0)
  const ts = view.getFloat64(1)
  const seq = view.getUint32(9)

  if (type === T_CHUNK) {
    const payload = data.byteLength - HEADER_SIZE
    s.bytes += payload
    s.winBytes += payload
    s.chunks++
    if (s.lastSeq >= 0 && seq > s.lastSeq + 1) s.gaps += seq - s.lastSeq - 1
    s.lastSeq = Math.max(s.lastSeq, seq)
    s.lastHeartbeat = Date.now()
    if (!s.targetReached && s.bytes >= TARGET_BYTES) {
      s.targetReached = true
      log('500 MB target received')
    }
  } else if (type === T_PING) {
    s.lastHeartbeat = Date.now()
    socket.write(frame(T_PONG, ts, seq, 0))
  } else if (type === T_PONG) {
    s.lastHeartbeat = Date.now()
    s.rttMs = Date.now() - ts
  } else if (type === T_LAN_HINT) {
    if (
      s.mode === 'join' &&
      !s.remote?.host?.startsWith('192.168.') &&
      !s.remote?.host?.startsWith('10.')
    ) {
      try {
        const payloadBuf = data.subarray(HEADER_SIZE)
        const hint = JSON.parse(b4a.toString(payloadBuf))
        if (hint && Array.isArray(hint.ips) && hint.port) {
          let localIps = []
          try {
            const ifaces = udx.networkInterfaces()
            localIps = ifaces
              .filter((i) => i.family === 4 && !i.internal && i.host)
              .map((i) => i.host)
          } catch {}
          for (const ip of hint.ips) {
            const subnet = ip.split('.').slice(0, 3).join('.')
            const localMatch = localIps.some((l) => l.startsWith(subnet))
            if (localMatch) {
              log(
                `Auto-Upgrade: Same Wi-Fi detected! Migrating connection to LAN IP ${ip}:${hint.port}...`
              )
              s.swarm._handlePeer(
                { publicKey: s.topic, relayAddresses: [{ host: ip, port: hint.port }] },
                s.topic
              )
              break
            }
          }
        }
      } catch {}
    }
  }
}

function frame(type, ts, seq, payloadSize) {
  const buf = b4a.alloc(HEADER_SIZE + payloadSize)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  view.setUint8(0, type)
  view.setFloat64(1, ts)
  view.setUint32(9, seq)
  return buf
}

// Pre-allocated chunk buffer pool with in-place zero-copy SecretStream support
const POOL_SIZE = 8
const chunkPool = []
const template = crypto.randomBytes(CHUNK_SIZE - HEADER_SIZE)
for (let i = 0; i < POOL_SIZE; i++) {
  const buf = b4a.alloc(CHUNK_SIZE)
  buf[0] = T_CHUNK
  buf.set(template, HEADER_SIZE)
  chunkPool.push(buf)
}
let poolIndex = 0

function getNextChunk(s, socket) {
  let buf = null
  if (socket && typeof socket.alloc === 'function') {
    // Zero-copy in-place fast path: eliminates 100% of buffer reallocations in SecretStream
    buf = socket.alloc(CHUNK_SIZE)
  } else {
    buf = chunkPool[poolIndex++ % POOL_SIZE]
  }
  buf[0] = T_CHUNK
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  view.setFloat64(1, Date.now())
  view.setUint32(9, s.seq++)
  buf.set(template, HEADER_SIZE)
  return buf
}

function setSpeed(speedMode) {
  const s = session
  if (!s) return
  s.speedMode = speedMode
  s.rateStart = 0
  s.rateBytes = 0
  if (s.mode === 'host' && s.socket) {
    applySpeedMode(s)
  }
  telemetry(s)
}

const HWM_BYTES = 2 * 1024 * 1024

function applySpeedMode(s) {
  if (s.mode !== 'host') return
  if (s.streamTimer) {
    clearInterval(s.streamTimer)
    s.streamTimer = null
  }
  if (!s.socket || s.targetReached) return

  s.rateStart = 0
  s.rateBytes = 0
  s.needsDrain = false
  log(`Throughput profile set to: ${s.speedMode.toUpperCase()}`)

  if (s.speedMode === 'max') {
    s.streamTimer = setInterval(() => pumpReplenish(s), 4)
    pumpReplenish(s)
  } else {
    s.streamTimer = setInterval(() => pump(s), 10)
    pump(s)
  }
}

function pumpReplenish(s) {
  const socket = s.socket
  if (!socket || s.targetReached || s.pumping) return
  s.pumping = true
  const payload = CHUNK_SIZE - HEADER_SIZE

  while (
    !s.targetReached &&
    (!socket._writableState || socket._writableState.buffered < HWM_BYTES)
  ) {
    const buf = getNextChunk(s, socket)
    s.bytes += payload
    s.winBytes += payload
    s.chunks++

    if (s.bytes >= TARGET_BYTES) {
      s.targetReached = true
      log('500 MB target sent - heartbeats continue')
      socket.write(buf)
      break
    }
    if (socket.write(buf) === false) {
      break
    }
  }
  s.pumping = false
}

function pump(s) {
  const socket = s.socket
  if (!socket || s.targetReached || s.needsDrain) return
  const payload = CHUNK_SIZE - HEADER_SIZE

  // Rate-limited governor for selectable speeds
  const targetBps = SPEED_RATES[s.speedMode] || SPEED_RATES['256k']
  const now = Date.now()
  if (!s.rateStart) {
    s.rateStart = now
    s.rateBytes = 0
  }
  const elapsedSec = (now - s.rateStart) / 1000
  const allowedBytes = elapsedSec * targetBps

  while (s.rateBytes < allowedBytes && !s.targetReached && !s.needsDrain) {
    const buf = getNextChunk(s, socket)
    s.bytes += payload
    s.winBytes += payload
    s.rateBytes += payload
    s.chunks++
    if (s.bytes >= TARGET_BYTES) {
      s.targetReached = true
      log('500 MB target sent - heartbeats continue')
      socket.write(buf)
      break
    }
    if (socket.write(buf) === false) {
      s.needsDrain = true
      break
    }
  }

  if (elapsedSec > 5) {
    s.rateStart = now
    s.rateBytes = 0
  }
}

function sendPing(s) {
  if (!s.socket) return
  s.socket.write(frame(T_PING, Date.now(), s.seq, 0))
}

// ---------------------------------------------------------------------------
// Telemetry

function telemetry(s) {
  if (session !== s) return
  const now = Date.now()

  const winMs = now - s.winStart
  if (winMs >= 1000) {
    const raw = s.socket?.rawStream
    const currentWire =
      s.mode === 'host' ? raw?.bytesTransmitted || s.bytes : raw?.bytesReceived || s.bytes
    const wireDelta = s.lastWireBytes > 0 ? Math.max(0, currentWire - s.lastWireBytes) : 0
    s.lastWireBytes = currentWire

    s.throughput = wireDelta > 0 ? (wireDelta * 1000) / winMs : (s.winBytes * 1000) / winMs
    s.winBytes = 0
    s.winStart = now
  }

  let state = 'Searching DHT'
  if (s.socket) {
    state =
      now - s.lastHeartbeat > STALL_MS
        ? 'Stalled'
        : s.remote.relayed
          ? 'Connected (Relayed)'
          : 'Connected Direct P2P'
  } else if (s.swarm.connecting > 0) {
    state = 'Hole-Punching'
  } else if (s.disconnects > 0) {
    state = 'Disconnected'
  }

  const d = s.swarm.dht
  send({
    type: 'telemetry',
    mode: s.mode,
    speedMode: s.speedMode,
    state,
    remote: s.socket ? s.remote : null,
    nat: {
      host: d.host || null,
      port: d.port || null,
      firewalled: !!d.firewalled,
      randomized: !!d.randomized
    },
    bytes: s.bytes,
    targetBytes: TARGET_BYTES,
    throughput: s.throughput,
    chunks: s.chunks,
    dropped: s.dropped,
    gaps: s.gaps,
    rttMs: (s.socket && s.socket.rawStream && s.socket.rawStream.rtt) || s.rttMs,
    lastHeartbeat: s.lastHeartbeat || null,
    connectedAt: s.connectedAt || null,
    firstConnectAt: s.firstConnectAt || null,
    sessionStartedAt: s.startedAt,
    disconnects: s.disconnects,
    peers: s.swarm.connections.size,
    connecting: s.swarm.connecting,
    now
  })
}

send({ type: 'ready' })
log('Worklet booted')
