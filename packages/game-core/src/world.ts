import type { SimConfig } from './config';
import { nextRandom } from './math';
import { createSnake } from './snake';
import type { GameState, Pellet, Snake } from './types';

export interface PlayerSpec {
  name: string;
  isBot?: boolean;
}

/**
 * Creates a fresh match with players spread evenly on a ring. Everyone faces along the
 * ring in the same direction, so nobody starts on a collision course; facing the center
 * made every match open with a pile-up.
 */
export function createGame(players: PlayerSpec[], cfg: SimConfig, seed = 1): GameState {
  const radius = cfg.arenaBaseRadius + cfg.arenaPerPlayer * players.length;
  const ring = radius * 0.6;
  const snakes: Snake[] = players.map((p, i) => {
    const a = (i / players.length) * Math.PI * 2;
    const head = { x: Math.cos(a) * ring, y: Math.sin(a) * ring };
    return createSnake(i + 1, p.name, head, a + Math.PI / 2, cfg, p.isBot ?? false);
  });
  const state: GameState = {
    tick: 0,
    snakes,
    pellets: [],
    arena: { center: { x: 0, y: 0 }, radius, startRadius: radius, targetRadius: radius },
    nextPelletId: 1,
    seed,
    finished: false,
    winnerId: null,
    events: [],
  };
  fillPellets(state, cfg, Infinity);
  return state;
}

export function targetPelletCount(state: GameState, cfg: SimConfig): number {
  const r = state.arena.radius;
  return Math.floor(((Math.PI * r * r) / 10000) * cfg.pelletDensity);
}

export function random(state: GameState): number {
  const [v, seed] = nextRandom(state.seed);
  state.seed = seed;
  return v;
}

export function addPellet(state: GameState, x: number, y: number, value: number): Pellet {
  const p = { id: state.nextPelletId++, x, y, value };
  state.pellets.push(p);
  return p;
}

/** Tops up pellets toward the density target, spawning uniformly inside the arena. */
export function fillPellets(state: GameState, cfg: SimConfig, maxSpawns: number): void {
  const want = targetPelletCount(state, cfg) - state.pellets.length;
  const n = Math.min(want, maxSpawns);
  const { center, radius } = state.arena;
  for (let i = 0; i < n; i++) {
    const a = random(state) * Math.PI * 2;
    const r = Math.sqrt(random(state)) * radius * 0.97;
    addPellet(state, center.x + Math.cos(a) * r, center.y + Math.sin(a) * r, cfg.pelletValue);
  }
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    snakes: s.snakes.map((sn) => ({
      ...sn,
      head: { ...sn.head },
      path: sn.path.map((p) => ({ x: p.x, y: p.y })),
      segments: sn.segments.map((p) => ({ x: p.x, y: p.y })),
    })),
    pellets: s.pellets.map((p) => ({ ...p })),
    arena: { ...s.arena, center: { ...s.arena.center } },
    events: [],
  };
}
