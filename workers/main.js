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

const CHUNK_SIZE = 64 * 1024
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

async function start(mode, topicHex, speedMode = 'max') {
  if (session) await stop()

  let topic = null
  if (mode === 'host') {
    topic = crypto.randomBytes(32)
  } else {
    const hex = String(topicHex || '')
      .trim()
      .toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      send({ type: 'error', msg: 'Topic key must be 64 hex characters' })
      return
    }
    topic = b4a.from(hex, 'hex')
  }

  const s = {
    mode,
    speedMode,
    rateStart: 0,
    rateBytes: 0,
    streamTimer: null,
    topic,
    topicHex: b4a.toString(topic, 'hex'),
    swarm: new Hyperswarm(),
    discovery: null,
    socket: null,
    remote: null,
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

  log('Bootstrapping DHT...')
  const tDht = Date.now()
  s.swarm.dht
    .ready()
    .then(() => {
      if (session !== s) return
      const d = s.swarm.dht
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
      if (!s.socket && s.discovery) {
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

  const raw = socket.rawStream
  const remote = {
    host: (raw && raw.remoteHost) || '?',
    port: (raw && raw.remotePort) || 0,
    publicKey: b4a.toString(info.publicKey, 'hex').slice(0, 12),
    client: !!info.client,
    relayed: !!(socket.relay || (raw && raw.relayed))
  }

  if (s.socket) {
    // Only one peer is measured at a time; keep the first, close extras.
    log(`Extra connection from ${remote.host}:${remote.port} ignored`)
    socket.on('error', () => {})
    return socket.destroy()
  }

  const now = Date.now()
  s.socket = socket
  s.remote = remote
  s.connectedAt = now
  s.lastHeartbeat = now
  if (!s.firstConnectAt) {
    s.firstConnectAt = now
    log(`First connection ${now - s.startedAt}ms after joining`)
  }
  log(
    `CONNECTED ${remote.relayed ? 'via RELAY' : 'direct P2P'} to ${remote.host}:${remote.port} ` +
      `(peer ${remote.publicKey}..., we are ${remote.client ? 'client' : 'server'})`
  )

  socket.setKeepAlive?.(5000)

  s.needsDrain = false
  socket.on('drain', () => {
    if (s.socket === socket) {
      s.needsDrain = false
      if (s.mode === 'host') {
        pump(s)
      }
    }
  })
  socket.on('data', (data) => onPeerData(s, socket, data))
  socket.on('error', (err) => log(`Socket error: ${err.code || err.message}`))
  socket.on('close', () => {
    if (s.socket !== socket) return
    if (s.streamTimer) {
      clearInterval(s.streamTimer)
      s.streamTimer = null
    }
    const up = ((Date.now() - s.connectedAt) / 1000).toFixed(1)
    s.socket = null
    s.connectedAt = 0
    s.disconnects++
    log(`DISCONNECTED after ${up}s (drop #${s.disconnects}) - swarm will retry`)
    telemetry(s)
  })

  if (s.mode === 'host') {
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
    s.lastSeq = seq
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

let chunkTemplate = null

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

function applySpeedMode(s) {
  if (s.mode !== 'host') return
  if (s.streamTimer) {
    clearInterval(s.streamTimer)
    s.streamTimer = null
  }
  if (!s.socket || s.targetReached) return

  s.rateStart = 0
  s.rateBytes = 0
  log(`Throughput profile set to: ${s.speedMode.toUpperCase()}`)

  if (s.speedMode === 'max') {
    pump(s)
  } else {
    s.streamTimer = setInterval(() => pump(s), 25)
    pump(s)
  }
}

function pump(s) {
  const socket = s.socket
  if (!socket || s.targetReached || s.needsDrain) return
  if (!chunkTemplate) chunkTemplate = crypto.randomBytes(CHUNK_SIZE - HEADER_SIZE)
  const payload = CHUNK_SIZE - HEADER_SIZE

  if (s.speedMode === 'max') {
    let batch = 0
    const MAX_BATCH = 16
    while (!s.targetReached && !s.needsDrain && batch < MAX_BATCH) {
      const buf = frame(T_CHUNK, Date.now(), s.seq++, payload)
      buf.set(chunkTemplate, HEADER_SIZE)
      s.bytes += payload
      s.winBytes += payload
      s.chunks++
      batch++
      if (s.bytes >= TARGET_BYTES) {
        s.targetReached = true
        log('500 MB target sent - heartbeats continue')
        break
      }
      if (socket.write(buf) === false) {
        s.needsDrain = true
        break
      }
    }
    if (!s.targetReached && !s.needsDrain && s.speedMode === 'max') {
      setTimeout(() => {
        if (session === s && s.speedMode === 'max') pump(s)
      }, 0)
    }
    return
  }

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
    const buf = frame(T_CHUNK, now, s.seq++, payload)
    buf.set(chunkTemplate, HEADER_SIZE)
    s.bytes += payload
    s.winBytes += payload
    s.rateBytes += payload
    s.chunks++
    if (s.bytes >= TARGET_BYTES) {
      s.targetReached = true
      log('500 MB target sent - heartbeats continue')
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
    s.throughput = (s.winBytes * 1000) / winMs
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
    rttMs: s.rttMs,
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
