import type { SimConfig } from './config';
import { nextRandom } from './math';
import { createSnake } from './snake';
import type { GameState, Obstacle, Pellet, Snake } from './types';

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
    obstacles: [],
    nextPelletId: 1,
    seed,
    finished: false,
    winnerId: null,
    events: [],
  };
  state.obstacles = makeObstacles(state, cfg);
  fillPellets(state, cfg, Infinity);
  return state;
}

/** Keep-clear distance around each spawn point, so nobody starts next to (or facing) a rock. */
const SPAWN_CLEARANCE = 300;
const ROCK_GAP = 80;

/** Scatters rocks inside the arena with the seeded PRNG, clear of spawns and of each other. */
function makeObstacles(state: GameState, cfg: SimConfig): Obstacle[] {
  const { radius } = state.arena;
  const want = Math.floor(((Math.PI * radius * radius) / 10000) * cfg.obstacleDensity);
  const rocks: Obstacle[] = [];
  for (let attempt = 0; rocks.length < want && attempt < want * 20; attempt++) {
    const a = random(state) * Math.PI * 2;
    const r = Math.sqrt(random(state)) * radius * 0.92;
    const size = cfg.obstacleMinRadius + random(state) * (cfg.obstacleMaxRadius - cfg.obstacleMinRadius);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (state.snakes.some((s) => Math.hypot(s.head.x - x, s.head.y - y) < SPAWN_CLEARANCE + size)) continue;
    if (rocks.some((o) => Math.hypot(o.x - x, o.y - y) < o.radius + size + ROCK_GAP)) continue;
    rocks.push({ x, y, radius: size });
  }
  return rocks;
}

/** True when a circle of `radius` at (x, y) overlaps a rock. */
export function touchesObstacle(obstacles: readonly Obstacle[], x: number, y: number, radius: number): boolean {
  for (const o of obstacles) {
    const r = o.radius + radius;
    if ((o.x - x) ** 2 + (o.y - y) ** 2 <= r * r) return true;
  }
  return false;
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
    const x = center.x + Math.cos(a) * r;
    const y = center.y + Math.sin(a) * r;
    // Pellets inside a rock would be unreachable: skip the spawn (the next tick tries again).
    if (touchesObstacle(state.obstacles, x, y, cfg.pelletRadius)) continue;
    addPellet(state, x, y, cfg.pelletValue);
  }
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    // Points and pellets are never mutated in place: step replaces heads and segment arrays
    // and only pushes/splices paths. So copying the arrays (or sharing segments) is enough;
    // deep-copying every point each tick was costly and caused GC pauses.
    snakes: s.snakes.map((sn) => ({
      ...sn,
      head: { ...sn.head },
      path: sn.path.slice(),
    })),
    pellets: s.pellets.slice(),
    arena: { ...s.arena, center: { ...s.arena.center } },
    events: [],
  };
}
