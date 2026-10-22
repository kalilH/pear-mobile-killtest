/* global __DEV__ */

// P2P kill-test diagnostic UI.
//
// Starts the Bare worklet (workers/main.js -> src/worker.bundle.js) directly with
// react-native-bare-kit and exchanges JSON frames with it over FramedStream.
// See workers/main.js for the frame protocol.

import { useCallback, useEffect, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import {
  AppState,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native'
import { Worklet } from 'react-native-bare-kit'
import * as Clipboard from 'expo-clipboard'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import FramedStream from 'framed-stream'
import b4a from 'b4a'
import bundle from './worker.bundle.js'

type Mode = 'host' | 'join'

type SpeedMode = '256k' | '2m' | '5m' | '10m' | 'max'

type Telemetry = {
  mode: Mode | null
  speedMode?: SpeedMode
  state: string
  remote?: {
    host: string
    port: number
    publicKey: string
    client: boolean
    relayed: boolean
  } | null
  nat?: { host: string | null; port: number | null; firewalled: boolean; randomized: boolean }
  bytes?: number
  targetBytes?: number
  throughput?: number
  chunks?: number
  dropped?: number
  gaps?: number
  rttMs?: number | null
  lastHeartbeat?: number | null
  connectedAt?: number | null
  firstConnectAt?: number | null
  sessionStartedAt?: number
  disconnects?: number
  peers?: number
  connecting?: number
}

type LogEntry = { id: number; t: number; src: 'UI' | 'P2P'; msg: string }

// Runtime getters present on BareKitWorklet but missing from its index.d.ts.
type WorkletState = {
  readonly started: boolean
  readonly suspended: boolean
  readonly terminated: boolean
}

const KEEP_AWAKE_TAG = 'p2p-kill-test'
const MAX_LOG = 500
const TELEMETRY_GAP_MS = 3000

let logSeq = 0

export default function App() {
  const workletRef = useRef<Worklet | null>(null)
  const pipeRef = useRef<FramedStream | null>(null)
  const lastTelemetryAt = useRef(0)

  const [booted, setBooted] = useState(false)
  const [topic, setTopic] = useState('')
  const [directKey, setDirectKey] = useState('')
  const [joinKey, setJoinKey] = useState('')
  const [telemetry, setTelemetry] = useState<Telemetry>({ mode: null, state: 'Idle' })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [autoKeepAwake, setAutoKeepAwake] = useState(true)
  const [bypassSuspend, setBypassSuspend] = useState(true)
  const [keepAwake, setKeepAwake] = useState(false)
  const [speedMode, setSpeedMode] = useState<SpeedMode>('max')
  const [now, setNow] = useState(Date.now())

  const telemetryRef = useRef(telemetry)
  telemetryRef.current = telemetry
  const bgSnapshotRef = useRef<{ time: number; bytes: number } | null>(null)

  const bypassRef = useRef(bypassSuspend)
  bypassRef.current = bypassSuspend

  const addLog = useCallback((src: LogEntry['src'], msg: string, t = Date.now()) => {
    setLogs((prev) => [{ id: logSeq++, t, src, msg }, ...prev].slice(0, MAX_LOG))
  }, [])

  // -------------------------------------------------------------------------
  // Worklet lifecycle

  useEffect(() => {
    const worklet = new Worklet()
    workletRef.current = worklet
    worklet.start('/app.bundle', bundle)

    const pipe = new FramedStream(worklet.IPC)
    pipeRef.current = pipe

    pipe.on('data', (data: Uint8Array) => {
      let msg: any
      try {
        msg = JSON.parse(b4a.toString(data))
      } catch {
        return
      }

      if (msg.type === 'telemetry') {
        const at = Date.now()
        const gap = lastTelemetryAt.current ? at - lastTelemetryAt.current : 0
        if (gap > TELEMETRY_GAP_MS) addLog('UI', `Telemetry gap ${(gap / 1000).toFixed(1)}s`)
        lastTelemetryAt.current = at
        setTelemetry(msg)
      } else if (msg.type === 'log') {
        addLog('P2P', msg.msg, msg.t)
      } else if (msg.type === 'topic') {
        setTopic(msg.topic)
        if (msg.directKey) setDirectKey(msg.directKey)
      } else if (msg.type === 'ready') {
        setBooted(true)
      } else if (msg.type === 'error') {
        addLog('P2P', `ERROR: ${msg.msg}`)
      }
    })
    pipe.on('error', (err: Error) => addLog('UI', `IPC error: ${err.message}`))

    addLog('UI', `App started (${Platform.OS}, ${__DEV__ ? 'debug' : 'release'})`)

    return () => {
      pipe.destroy()
      worklet.terminate()
      workletRef.current = null
      pipeRef.current = null
    }
  }, [addLog])

  // -------------------------------------------------------------------------
  // AppState: log transitions, track background transfer, and undo BareKit auto-suspend

  useEffect(() => {
    // react-native-bare-kit registers its own AppState listener at import time
    // that suspend()s every started worklet on 'background'. Ours is registered
    // later, so it runs after theirs and can resume the worklet again.
    const sub = AppState.addEventListener('change', (state) => {
      const w = workletRef.current as (Worklet & WorkletState) | null
      if (state === 'background') {
        bgSnapshotRef.current = {
          time: Date.now(),
          bytes: telemetryRef.current.bytes ?? 0
        }
        addLog(
          'UI',
          `AppState -> background (worklet active: ${!w?.suspended}, bypass: ${bypassRef.current})`
        )
      } else if (state === 'active') {
        if (bgSnapshotRef.current) {
          const elapsedSec = (Date.now() - bgSnapshotRef.current.time) / 1000
          const bytesSent = (telemetryRef.current.bytes ?? 0) - bgSnapshotRef.current.bytes
          const mb = (bytesSent / (1024 * 1024)).toFixed(1)
          const rate = elapsedSec > 0 ? (bytesSent / (1024 * 1024) / elapsedSec).toFixed(1) : '0'
          if (bytesSent > 0) {
            addLog('UI', `AppState -> active (+${mb} MB in background @ ${rate} MB/s)`)
          } else {
            addLog('UI', `AppState -> active (${elapsedSec.toFixed(0)}s in background)`)
          }
          bgSnapshotRef.current = null
        } else {
          addLog('UI', 'AppState -> active')
        }
      }
      if (w && bypassRef.current && w.suspended && !w.terminated) {
        w.resume()
        addLog('UI', 'Worklet resumed (bypass auto-suspend)')
      }
    })
    return () => sub.remove()
  }, [addLog])

  useEffect(() => {
    // Removing the worklet from BareKit's static registry stops the global
    // AppState listener from suspending it at all (cleaner than suspend+resume).
    const w = workletRef.current as (Worklet & WorkletState) | null
    const registry: Set<unknown> | undefined = (Worklet as unknown as { _worklets?: Set<unknown> })
      ._worklets
    if (!w || !registry) return
    if (bypassSuspend) registry.delete(w)
    else if (w.started && !w.terminated) registry.add(w)
  }, [bypassSuspend, booted])

  // UI clock for the duration timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // -------------------------------------------------------------------------
  // Smart Screen Keep-Awake during Active Transfers

  const isTransferring =
    telemetry.mode !== null &&
    (telemetry.state === 'Streaming' ||
      telemetry.state === 'Connecting' ||
      telemetry.state === 'Ready')

  useEffect(() => {
    if (autoKeepAwake && isTransferring) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})
    } else if (!keepAwake) {
      deactivateKeepAwake(KEEP_AWAKE_TAG)
    }
  }, [autoKeepAwake, isTransferring, keepAwake])

  const toggleKeepAwake = useCallback(
    async (on: boolean) => {
      setKeepAwake(on)
      try {
        if (on) await activateKeepAwakeAsync(KEEP_AWAKE_TAG)
        else deactivateKeepAwake(KEEP_AWAKE_TAG)
        addLog('UI', `Force screen keep-awake ${on ? 'ON' : 'OFF'}`)
      } catch (err: any) {
        addLog('UI', `Keep-awake error: ${err?.message ?? String(err)}`)
      }
    },
    [addLog]
  )

  const toggleBypass = useCallback(
    (on: boolean) => {
      setBypassSuspend(on)
      addLog('UI', `BareKit auto-suspend ${on ? 'BYPASSED' : 'restored'}`)
    },
    [addLog]
  )

  // -------------------------------------------------------------------------
  // Commands

  const send = (obj: object) => pipeRef.current?.write(JSON.stringify(obj))

  const updateSpeedMode = (mode: SpeedMode) => {
    setSpeedMode(mode)
    if (telemetry.mode === 'host') {
      send({ type: 'setSpeed', speedMode: mode })
      addLog('UI', `Speed profile -> ${mode.toUpperCase()}`)
    }
  }

  const startHost = () => {
    setTopic('')
    setDirectKey('')
    send({ type: 'host', speedMode })
  }

  const startJoin = (key?: string) => {
    const k = (key ?? joinKey).trim().toLowerCase()
    if (!/^[0-9a-f]{64}(@[^\s]+)?$/.test(k)) {
      addLog('UI', 'Key must be 64 hex characters (optional @ip:port)')
      return
    }
    setJoinKey(k)
    setTopic(k)
    send({ type: 'join', topic: k })
  }

  const pasteAndConnect = async () => {
    const text = (await Clipboard.getStringAsync()).trim()
    const match = text.match(/[0-9a-fA-F]{64}(@[^\s]+)?/)
    if (!match) {
      addLog('UI', 'Clipboard has no 64-char hex key')
      return
    }
    startJoin(match[0])
  }

  const stop = () => {
    send({ type: 'stop' })
    setTopic('')
    setDirectKey('')
  }

  const copyKey = async () => {
    await Clipboard.setStringAsync(topic)
    addLog('UI', 'Topic key copied')
  }

  const shareKey = () => Share.share({ message: topic }).catch(() => {})

  const exportLog = () => {
    const text = [...logs]
      .reverse()
      .map((l) => `${new Date(l.t).toISOString()} [${l.src}] ${l.msg}`)
      .join('\n')
    Share.share({ message: text }).catch(() => {})
  }

  // -------------------------------------------------------------------------
  // Render

  const active = telemetry.mode !== null && telemetry.state !== 'Idle'
  const bytes = telemetry.bytes ?? 0
  const target = telemetry.targetBytes ?? 500 * 1024 * 1024
  const silentFor = lastTelemetryAt.current && active ? now - lastTelemetryAt.current : 0

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style='light' />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps='handled'>
        <Text style={styles.h1}>P2P KILL-TEST</Text>
        <Text style={styles.sub}>
          {booted ? 'Bare worklet running' : 'Booting Bare worklet...'} · {Platform.OS}
          {__DEV__ ? ' · DEBUG' : ' · RELEASE'}
        </Text>

        {/* Mode selector */}
        {(!active || telemetry.mode === 'host') && (
          <View style={styles.card}>
            <Text style={styles.label}>
              {telemetry.mode === 'host' ? 'TRANSFER SPEED (ACTIVE)' : 'HOST SPEED PROFILE'}
            </Text>
            <View style={styles.speedRow}>
              {(
                [
                  { id: '256k', label: '256K' },
                  { id: '2m', label: '2 MB/s' },
                  { id: '5m', label: '5 MB/s' },
                  { id: '10m', label: '10 MB/s' },
                  { id: 'max', label: 'MAX 🚀' }
                ] as const
              ).map((opt) => {
                const currentMode =
                  telemetry.mode === 'host' ? (telemetry.speedMode ?? speedMode) : speedMode
                const isSel = currentMode === opt.id
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => updateSpeedMode(opt.id)}
                    style={[styles.speedBtn, isSel && styles.speedBtnActive]}
                  >
                    <Text style={[styles.speedBtnText, isSel && styles.speedBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        )}

        {!active ? (
          <View>
            <Btn label='Start as Peer A (Host)' onPress={startHost} disabled={!booted} big />
            <View style={styles.card}>
              <Text style={styles.label}>JOIN AS PEER B (CLIENT)</Text>
              <TextInput
                value={joinKey}
                onChangeText={setJoinKey}
                placeholder='64-char hex topic key'
                placeholderTextColor='#666'
                autoCapitalize='none'
                autoCorrect={false}
                style={styles.input}
              />
              <View style={styles.row}>
                <Btn
                  label='Paste Key & Connect'
                  onPress={pasteAndConnect}
                  disabled={!booted}
                  flex
                />
                <Btn label='Connect' onPress={() => startJoin()} disabled={!booted} flex />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>
              {telemetry.mode === 'host'
                ? 'PEER A (HOST) — TOPIC KEY'
                : 'PEER B (CLIENT) — TOPIC KEY'}
            </Text>
            <Text selectable style={styles.key}>
              {topic || '...'}
            </Text>
            <View style={styles.row}>
              <Btn label='Copy Key' onPress={copyKey} disabled={!topic} flex />
              <Btn label='Share Key' onPress={shareKey} disabled={!topic} flex />
              <Btn label='Stop' onPress={stop} danger flex />
            </View>
            {directKey ? (
              <View
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: '#334155'
                }}
              >
                <Text style={styles.label}>DIRECT HOTSPOT / LAN KEY (0-INTERNET)</Text>
                <Text selectable style={[styles.key, { color: '#4ade80' }]}>
                  {directKey}
                </Text>
                <View style={[styles.row, { marginTop: 6 }]}>
                  <Btn
                    label='Copy Hotspot Key'
                    onPress={async () => {
                      await Clipboard.setStringAsync(directKey)
                      addLog('UI', 'Direct Hotspot key copied')
                    }}
                    flex
                  />
                </View>
              </View>
            ) : null}
          </View>
        )}

        {/* Persistence & Screen Toggles */}
        <View style={styles.card}>
          <Toggle
            label='Auto-prevent screen sleep during transfer'
            value={autoKeepAwake}
            onChange={setAutoKeepAwake}
          />
          <Toggle
            label='Bypass BareKit auto-suspend on background'
            value={bypassSuspend}
            onChange={toggleBypass}
          />
          <Toggle label='Force screen awake always' value={keepAwake} onChange={toggleKeepAwake} />
        </View>

        {/* Dashboard */}
        <View style={styles.card}>
          <View style={[styles.badge, { backgroundColor: stateColor(telemetry.state) }]}>
            <Text style={styles.badgeText}>{telemetry.state.toUpperCase()}</Text>
          </View>
          {silentFor > TELEMETRY_GAP_MS && (
            <Text style={styles.warn}>Worklet silent for {Math.round(silentFor / 1000)}s</Text>
          )}

          <Text style={styles.timer}>
            {fmtDuration(telemetry.connectedAt ? now - telemetry.connectedAt : 0)}
          </Text>
          <Text style={styles.dim}>
            current link · session{' '}
            {fmtDuration(telemetry.firstConnectAt ? now - telemetry.firstConnectAt : 0)} since first
            connect
          </Text>

          <Stat
            label={telemetry.mode === 'host' ? 'Sent' : 'Received'}
            value={`${mb(bytes)} MB / ${mb(target, 0)} MB`}
          />
          <View style={styles.progress}>
            <View
              style={[styles.progressFill, { width: `${Math.min(100, (bytes / target) * 100)}%` }]}
            />
          </View>
          <Stat
            label='Speed'
            value={`${fmtSpeed(telemetry.throughput ?? 0)}${telemetry.speedMode ? ` (${telemetry.speedMode.toUpperCase()})` : ''}`}
          />
          <Stat
            label='Remote peer'
            value={telemetry.remote ? `${telemetry.remote.host}:${telemetry.remote.port}` : '—'}
          />
          <Stat
            label='Our public addr'
            value={telemetry.nat?.host ? `${telemetry.nat.host}:${telemetry.nat.port}` : '—'}
          />
          <Stat
            label='NAT'
            value={
              telemetry.nat
                ? `${telemetry.nat.randomized ? 'RANDOMIZED (symmetric)' : 'consistent'}${telemetry.nat.firewalled ? ', firewalled' : ''}`
                : '—'
            }
          />
          <Stat
            label='RTT'
            value={
              telemetry.rttMs !== null && telemetry.rttMs !== undefined
                ? `${telemetry.rttMs} ms`
                : '—'
            }
          />
          <Stat
            label='Last heartbeat'
            value={
              telemetry.lastHeartbeat
                ? `${new Date(telemetry.lastHeartbeat).toLocaleTimeString()} (${Math.max(0, Math.round((now - telemetry.lastHeartbeat) / 1000))}s ago)`
                : '—'
            }
          />
          <Stat
            label='Chunks / dropped / gaps'
            value={`${telemetry.chunks ?? 0} / ${telemetry.dropped ?? 0} / ${telemetry.gaps ?? 0}`}
          />
          <Stat label='Socket drops' value={String(telemetry.disconnects ?? 0)} />
          <Stat
            label='Peers / connecting'
            value={`${telemetry.peers ?? 0} / ${telemetry.connecting ?? 0}`}
          />
        </View>

        {/* Event log */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>EVENT LOG ({logs.length})</Text>
            <View style={styles.row}>
              <Btn label='Export' onPress={exportLog} small />
              <Btn label='Clear' onPress={() => setLogs([])} small />
            </View>
          </View>
          <ScrollView style={styles.log} nestedScrollEnabled>
            {logs.map((l) => (
              <Text
                key={l.id}
                style={[
                  styles.logLine,
                  l.src === 'UI' && styles.logUi,
                  isBad(l.msg) && styles.logBad
                ]}
              >
                {new Date(l.t).toLocaleTimeString()} {l.src} {l.msg}
              </Text>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Small components

function Btn(props: {
  label: string
  onPress: () => void
  disabled?: boolean
  big?: boolean
  flex?: boolean
  small?: boolean
  danger?: boolean
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.btn,
        props.big && styles.btnBig,
        props.flex && styles.flex1,
        props.small && styles.btnSmall,
        props.danger && styles.btnDanger,
        (pressed || props.disabled) && styles.btnDim
      ]}
    >
      <Text style={[styles.btnText, props.big && styles.btnTextBig]}>{props.label}</Text>
    </Pressable>
  )
}

function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.toggleLabel}>{props.label}</Text>
      <Switch value={props.value} onValueChange={props.onChange} />
    </View>
  )
}

function Stat(props: { label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.statLabel}>{props.label}</Text>
      <Text style={styles.statValue}>{props.value}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Formatting

function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

function mb(bytes: number, digits = 1) {
  return (bytes / (1024 * 1024)).toFixed(digits)
}

function fmtSpeed(bps: number) {
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`
  return `${Math.round(bps / 1024)} KB/s`
}

function stateColor(state: string) {
  if (state.startsWith('Connected')) return '#00c853'
  if (state === 'Hole-Punching') return '#ffab00'
  if (state === 'Searching DHT') return '#2979ff'
  if (state === 'Disconnected' || state === 'Stalled') return '#d50000'
  return '#555'
}

function isBad(msg: string) {
  return /DISCONNECT|FROZEN|SUSPEND|ERROR|error|gap|failed/.test(msg)
}

// ---------------------------------------------------------------------------

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' })

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', paddingTop: RNStatusBar.currentHeight ?? 0 },
  scroll: { padding: 16, paddingBottom: 48 },
  h1: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  sub: { color: '#aaa', marginBottom: 16 },
  card: {
    backgroundColor: '#111',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    gap: 8
  },
  label: { color: '#ffea00', fontWeight: '700', letterSpacing: 1 },
  key: { color: '#fff', fontFamily: mono, fontSize: 15, lineHeight: 22 },
  input: {
    color: '#fff',
    borderColor: '#555',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontFamily: mono,
    fontSize: 13
  },
  row: { flexDirection: 'row', gap: 8 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  flex1: { flex: 1 },
  btn: {
    backgroundColor: '#2962ff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center'
  },
  btnBig: { paddingVertical: 22, marginBottom: 14, backgroundColor: '#00c853' },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 10 },
  btnDanger: { backgroundColor: '#d50000' },
  btnDim: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnTextBig: { fontSize: 20 },
  toggleLabel: { color: '#fff', flex: 1, fontSize: 15 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 1 },
  warn: { color: '#ff5252', fontWeight: '700' },
  timer: { color: '#fff', fontFamily: mono, fontSize: 44, fontWeight: '700' },
  dim: { color: '#777', fontSize: 12, marginBottom: 6 },
  statLabel: { color: '#aaa' },
  statValue: { color: '#fff', fontFamily: mono, flexShrink: 1, textAlign: 'right' },
  progress: { height: 8, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#00c853' },
  speedRow: { flexDirection: 'row', gap: 6 },
  speedBtn: {
    flex: 1,
    backgroundColor: '#222',
    borderColor: '#444',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center'
  },
  speedBtnActive: { backgroundColor: '#00c853', borderColor: '#69f0ae' },
  speedBtnText: { color: '#aaa', fontSize: 12, fontWeight: '700' },
  speedBtnTextActive: { color: '#000', fontWeight: '800' },
  log: { maxHeight: 320 },
  logLine: { color: '#cfd8dc', fontFamily: mono, fontSize: 11, marginBottom: 2 },
  logUi: { color: '#80d8ff' },
  logBad: { color: '#ff8a80' }
})
