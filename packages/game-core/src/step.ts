import type { SimConfig } from './config';
import { dist2, turnToward } from './math';
import { bodyLengthForMass, radiusForMass, sampleSegments, trimPath, turnRateForMass } from './snake';
import { SpatialHash } from './spatialHash';
import type { GameEvent, GameState, Input, Snake, SnakeId } from './types';
import { addPellet, cloneState, fillPellets, random } from './world';

// Scratch structures reused across steps; they hold no state between calls.
const segmentHash = new SpatialHash(64);
const pelletHash = new SpatialHash(64);
// segmentHash item i -> owner snake index at [2i], segment index at [2i + 1].
const segOwner: number[] = [];

type Death = Extract<GameEvent, { type: 'death' }>;

/**
 * Advances the simulation by one fixed step of `cfg.dt`. Pure: returns a new state
 * and leaves `prev` untouched. Snakes without an input keep their last steering.
 */
export function step(prev: GameState, inputs: ReadonlyMap<SnakeId, Input>, cfg: SimConfig): GameState {
  const state = cloneState(prev);
  if (state.finished) return state;
  const dt = cfg.dt;
  state.tick++;

  for (const s of state.snakes) {
    if (!s.alive) continue;
    const input = inputs.get(s.id);
    if (input) {
      s.targetAngle = input.targetAngle;
      s.boosting = input.boost;
    }
    moveSnake(state, s, cfg, dt);
  }

  updateArena(state, cfg, dt);
  eatPellets(state, cfg);

  const deaths = findDeaths(state, cfg);
  for (const d of deaths.values()) killSnake(state, d, cfg);

  fillPellets(state, cfg, cfg.maxPelletSpawnsPerTick);
  checkWinner(state);
  return state;
}

function moveSnake(state: GameState, s: Snake, cfg: SimConfig, dt: number): void {
  // 1. Turn, limited by a mass-dependent turn rate.
  s.angle = turnToward(s.angle, s.targetAngle, turnRateForMass(s.mass, cfg) * dt);

  // 2. Move; boosting burns mass, which is dropped as pellets at the tail.
  const canBoost = s.boosting && s.mass > cfg.minBoostMass;
  s.speed = cfg.baseSpeed * (canBoost ? cfg.boostMultiplier : 1);
  if (canBoost) {
    const burn = Math.min(cfg.boostCostPerSecond * dt, s.mass - cfg.minBoostMass);
    s.mass -= burn;
    s.boostDebt += burn;
    if (s.boostDebt >= cfg.pelletValue) {
      const tail = s.segments[s.segments.length - 1] ?? s.head;
      addPellet(state, tail.x, tail.y, s.boostDebt);
      s.boostDebt = 0;
    }
  }
  s.head = {
    x: s.head.x + Math.cos(s.angle) * s.speed * dt,
    y: s.head.y + Math.sin(s.angle) * s.speed * dt,
  };

  // 3. Extend the path and rebuild the body from it.
  const length = bodyLengthForMass(s.mass, cfg);
  s.path.push({ x: s.head.x, y: s.head.y });
  trimPath(s.path, length + cfg.segmentSpacing);
  s.segments = sampleSegments(s.path, length, cfg.segmentSpacing);
  s.radius = radiusForMass(s.mass, cfg);
}

function updateArena(state: GameState, cfg: SimConfig, dt: number): void {
  const a = state.arena;
  const elapsed = state.tick * dt;
  let factor = 1;
  for (const st of cfg.shrinkSchedule) if (elapsed >= st.atSecond) factor = st.radiusFactor;
  a.targetRadius = a.startRadius * factor;
  if (a.radius > a.targetRadius) a.radius = Math.max(a.targetRadius, a.radius - cfg.shrinkSpeed * dt);
}

function eatPellets(state: GameState, cfg: SimConfig): void {
  const pellets = state.pellets;
  pelletHash.clear();
  for (let i = 0; i < pellets.length; i++) {
    const p = pellets[i]!;
    pelletHash.insert(i, p.x, p.y, cfg.pelletRadius);
  }
  const eaten = new Set<number>();
  for (const s of state.snakes) {
    if (!s.alive) continue;
    const reach = s.radius + cfg.eatReach + cfg.pelletRadius;
    const r2 = reach * reach;
    pelletHash.query(s.head.x, s.head.y, reach, (i) => {
      if (eaten.has(i)) return;
      const p = pellets[i]!;
      if (dist2(p.x, p.y, s.head.x, s.head.y) > r2) return;
      eaten.add(i);
      s.mass += p.value;
      state.events.push({ type: 'eat', snakeId: s.id, pelletId: p.id, value: p.value });
    });
  }
  if (eaten.size > 0) state.pellets = pellets.filter((_, i) => !eaten.has(i));
}

function findDeaths(state: GameState, cfg: SimConfig): Map<SnakeId, Death> {
  const deaths = new Map<SnakeId, Death>();
  const snakes = state.snakes;
  const die = (s: Snake, killerId: SnakeId | null, cause: Death['cause']) => {
    if (!deaths.has(s.id)) deaths.set(s.id, { type: 'death', snakeId: s.id, killerId, cause });
  };

  // Arena: the head leaving the circle kills.
  const { center, radius } = state.arena;
  for (const s of snakes) {
    if (s.alive && dist2(s.head.x, s.head.y, center.x, center.y) > radius * radius) die(s, null, 'arena');
  }

  // Head-to-head.
  for (let i = 0; i < snakes.length; i++) {
    const a = snakes[i]!;
    if (!a.alive) continue;
    for (let j = i + 1; j < snakes.length; j++) {
      const b = snakes[j]!;
      if (!b.alive) continue;
      const r = a.radius + b.radius;
      if (dist2(a.head.x, a.head.y, b.head.x, b.head.y) > r * r) continue;
      if (cfg.headToHead === 'bigger-wins' && a.mass !== b.mass) {
        if (a.mass > b.mass) die(b, a.id, 'head');
        else die(a, b.id, 'head');
      } else {
        die(a, b.id, 'head');
        die(b, a.id, 'head');
      }
    }
  }

  // Head-to-body: the mover dies. A snake's own body never collides with it.
  segmentHash.clear();
  segOwner.length = 0;
  for (let si = 0; si < snakes.length; si++) {
    const s = snakes[si]!;
    if (!s.alive) continue;
    for (let k = 1; k < s.segments.length; k++) {
      const seg = s.segments[k]!;
      segmentHash.insert(segOwner.length >> 1, seg.x, seg.y, s.radius);
      segOwner.push(si, k);
    }
  }
  for (const s of snakes) {
    if (!s.alive || deaths.has(s.id)) continue;
    segmentHash.query(s.head.x, s.head.y, s.radius, (item) => {
      if (deaths.has(s.id)) return;
      const other = snakes[segOwner[item * 2]!]!;
      if (other === s) return;
      const seg = other.segments[segOwner[item * 2 + 1]!]!;
      const r = s.radius + other.radius;
      if (dist2(s.head.x, s.head.y, seg.x, seg.y) <= r * r) die(s, other.id, 'body');
    });
  }
  return deaths;
}

function killSnake(state: GameState, death: Death, cfg: SimConfig): void {
  const s = state.snakes.find((sn) => sn.id === death.snakeId)!;
  s.alive = false;
  s.boosting = false;
  state.events.push(death);
  // Spread the body out as pellets, roughly one per two segments.
  const drops = Math.max(1, Math.ceil(s.segments.length / 2));
  const value = (s.mass * cfg.deathDropRatio) / drops;
  for (let i = 0; i < drops; i++) {
    const seg = s.segments[Math.min(s.segments.length - 1, i * 2)] ?? s.head;
    const jx = (random(state) - 0.5) * s.radius * 2;
    const jy = (random(state) - 0.5) * s.radius * 2;
    addPellet(state, seg.x + jx, seg.y + jy, value);
  }
}

function checkWinner(state: GameState): void {
  if (state.snakes.length < 2) return;
  const alive = state.snakes.filter((s) => s.alive);
  if (alive.length > 1) return;
  state.finished = true;
  state.winnerId = alive[0]?.id ?? null;
  state.events.push({ type: 'win', snakeId: state.winnerId });
}
