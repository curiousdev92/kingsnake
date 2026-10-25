import type { SimConfig } from '@snake/game-core';
import { ByteReader, ByteWriter } from './bytes';

/** Binary message types (Colyseus `sendBytes` / `onMessageBytes`). */
export const Msg = {
  // client -> server
  Input: 1,
  Ping: 2,
  // server -> client
  Snapshot: 10,
  /** Reliable world events: pellet spawns/removals and deaths. */
  Events: 11,
  Pong: 12,
} as const;

/** JSON message type for match lifecycle (not hot path). */
export const MATCH_MESSAGE = 'match';

// Positions are 16-bit fixed point: 1/8 world unit, covering about +-4096 units.
// The largest arena (16 players) has a radius of about 3100, centered on the origin.
const POS_SCALE = 8;
const POS_MAX = 32767;
const TAU = Math.PI * 2;

export const quantizePos = (v: number) => Math.max(-POS_MAX, Math.min(POS_MAX, Math.round(v * POS_SCALE)));
export const dequantizePos = (q: number) => q / POS_SCALE;
export const quantizeAngle = (a: number) => Math.round((((a % TAU) + TAU) % TAU) * (65536 / TAU)) & 0xffff;
/** Returns an angle in (-PI, PI]. */
export const dequantizeAngle = (q: number) => {
  const a = q * (TAU / 65536);
  return a > Math.PI ? a - TAU : a;
};

export interface Point {
  x: number;
  y: number;
}

// ---------- client -> server ----------

export interface InputMsg {
  seq: number;
  targetAngle: number;
  boost: boolean;
}

export function encodeInput(m: InputMsg): Uint8Array {
  return new ByteWriter(8).u32(m.seq).u16(quantizeAngle(m.targetAngle)).u8(m.boost ? 1 : 0).finish();
}

export function decodeInput(bytes: Uint8Array): InputMsg {
  const r = new ByteReader(bytes);
  return { seq: r.u32(), targetAngle: dequantizeAngle(r.u16()), boost: (r.u8() & 1) === 1 };
}

export const encodePing = (clientTime: number) => new ByteWriter(8).f64(clientTime).finish();
export const decodePing = (bytes: Uint8Array) => new ByteReader(bytes).f64();

// ---------- server -> client ----------

export interface PongMsg {
  clientTime: number;
  serverTime: number;
}

export const encodePong = (m: PongMsg) => new ByteWriter(16).f64(m.clientTime).f64(m.serverTime).finish();
export function decodePong(bytes: Uint8Array): PongMsg {
  const r = new ByteReader(bytes);
  return { clientTime: r.f64(), serverTime: r.f64() };
}

export interface SnakeSnap {
  id: number;
  x: number;
  y: number;
  angle: number;
  mass: number;
  boosting: boolean;
  /** Full body keyframe (index 0 = head), or null when the client rebuilds it from the head path. */
  body: Point[] | null;
}

export interface SnapshotMsg {
  tick: number;
  serverTime: number;
  /** Last input seq the server applied for the receiving client (for reconciliation). */
  lastSeq: number;
  arenaRadius: number;
  arenaTargetRadius: number;
  /** Living snakes only. A snake missing from a snapshot is dead or gone. */
  snakes: SnakeSnap[];
}

const SNAKE_BOOST = 1;
const SNAKE_BODY = 2;

export function encodeSnapshot(m: SnapshotMsg): Uint8Array {
  const w = new ByteWriter(64 + m.snakes.length * 16);
  w.u32(m.tick).f64(m.serverTime).u32(m.lastSeq).f32(m.arenaRadius).f32(m.arenaTargetRadius).u8(m.snakes.length);
  for (const s of m.snakes) {
    w.u16(s.id)
      .u8((s.boosting ? SNAKE_BOOST : 0) | (s.body ? SNAKE_BODY : 0))
      .i16(quantizePos(s.x))
      .i16(quantizePos(s.y))
      .u16(quantizeAngle(s.angle))
      .f32(s.mass);
    if (s.body) {
      w.u16(s.body.length);
      for (const p of s.body) w.i16(quantizePos(p.x)).i16(quantizePos(p.y));
    }
  }
  return w.finish();
}

export function decodeSnapshot(bytes: Uint8Array): SnapshotMsg {
  const r = new ByteReader(bytes);
  const tick = r.u32();
  const serverTime = r.f64();
  const lastSeq = r.u32();
  const arenaRadius = r.f32();
  const arenaTargetRadius = r.f32();
  const n = r.u8();
  const snakes: SnakeSnap[] = [];
  for (let i = 0; i < n; i++) {
    const id = r.u16();
    const flags = r.u8();
    const x = dequantizePos(r.i16());
    const y = dequantizePos(r.i16());
    const angle = dequantizeAngle(r.u16());
    const mass = r.f32();
    let body: Point[] | null = null;
    if (flags & SNAKE_BODY) {
      const len = r.u16();
      body = [];
      for (let k = 0; k < len; k++) body.push({ x: dequantizePos(r.i16()), y: dequantizePos(r.i16()) });
    }
    snakes.push({ id, x, y, angle, mass, boosting: (flags & SNAKE_BOOST) !== 0, body });
  }
  return { tick, serverTime, lastSeq, arenaRadius, arenaTargetRadius, snakes };
}

export interface PelletSnap {
  id: number;
  x: number;
  y: number;
  value: number;
}

export type DeathCause = 'body' | 'head' | 'arena';
const CAUSES: DeathCause[] = ['body', 'head', 'arena'];

export interface DeathSnap {
  snakeId: number;
  killerId: number | null;
  cause: DeathCause;
}

export interface EventsMsg {
  tick: number;
  serverTime: number;
  /** Clear all known pellets before applying `added` (sent on join and match start). */
  reset: boolean;
  added: PelletSnap[];
  removed: number[];
  deaths: DeathSnap[];
}

export function encodeEvents(m: EventsMsg): Uint8Array {
  const w = new ByteWriter(32 + m.added.length * 12 + m.removed.length * 4);
  w.u32(m.tick).f64(m.serverTime).u8(m.reset ? 1 : 0);
  w.u32(m.added.length);
  for (const p of m.added) w.u32(p.id).i16(quantizePos(p.x)).i16(quantizePos(p.y)).f32(p.value);
  w.u32(m.removed.length);
  for (const id of m.removed) w.u32(id);
  w.u8(m.deaths.length);
  for (const d of m.deaths) w.u16(d.snakeId).u16(d.killerId ?? 0).u8(CAUSES.indexOf(d.cause));
  return w.finish();
}

export function decodeEvents(bytes: Uint8Array): EventsMsg {
  const r = new ByteReader(bytes);
  const tick = r.u32();
  const serverTime = r.f64();
  const reset = r.u8() === 1;
  const added: PelletSnap[] = [];
  for (let i = r.u32(); i > 0; i--) added.push({ id: r.u32(), x: dequantizePos(r.i16()), y: dequantizePos(r.i16()), value: r.f32() });
  const removed: number[] = [];
  for (let i = r.u32(); i > 0; i--) removed.push(r.u32());
  const deaths: DeathSnap[] = [];
  for (let i = r.u8(); i > 0; i--) {
    const snakeId = r.u16();
    const killer = r.u16();
    deaths.push({ snakeId, killerId: killer === 0 ? null : killer, cause: CAUSES[r.u8()] ?? 'body' });
  }
  return { tick, serverTime, reset, added, removed, deaths };
}

// ---------- match lifecycle (JSON) ----------

export type MatchPhase = 'waiting' | 'countdown' | 'playing' | 'ended';

export interface RosterEntry {
  id: number;
  name: string;
  isBot: boolean;
}

export interface MatchMsg {
  phase: MatchPhase;
  /** Server time the countdown ends (countdown) or the next match starts (ended). */
  phaseEndsAt: number | null;
  /** The receiving client's snake, or null when spectating. */
  you: number | null;
  roster: RosterEntry[];
  winnerId: number | null;
  /** Humans still needed before the countdown starts (waiting). */
  needPlayers: number;
  /** The server's simulation config, so client-side body rebuilding matches. */
  config: SimConfig;
}
