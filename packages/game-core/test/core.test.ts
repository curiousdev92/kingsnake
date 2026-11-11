import { describe, expect, it } from 'vitest';
import {
  SpatialHash,
  botInputs,
  createGame,
  fillPellets,
  createSnake,
  defaultConfig,
  makeConfig,
  sampleSegments,
  step,
  turnToward,
  wrapAngle,
  type GameState,
  type Input,
  type SimConfig,
} from '../src';

describe('fixed tuning', () => {
  it('has the agreed values and cannot be changed', () => {
    expect(defaultConfig).toMatchObject({
      baseSpeed: 200,
      turnRate: 10,
      boostMultiplier: 2,
      boostCostPerSecond: 2,
      segmentSpacing: 9,
      lengthPerMass: 5,
    });
    expect(Object.isFrozen(defaultConfig)).toBe(true);
    expect(Object.isFrozen(defaultConfig.shrinkSchedule[0])).toBe(true);
    expect(() => {
      (defaultConfig as SimConfig).baseSpeed = 999;
    }).toThrow();
  });
});

// No pellet respawns, shrinking or rocks unless a test asks for them.
const quiet = (o: Partial<SimConfig> = {}) =>
  makeConfig({ pelletDensity: 0, shrinkSchedule: [], obstacleDensity: 0, ...o });

function soloGame(cfg: SimConfig, angle = 0): GameState {
  const s = createGame([{ name: 'p' }], cfg);
  s.snakes[0] = createSnake(1, 'p', { x: 0, y: 0 }, angle, cfg);
  return s;
}

const run = (s: GameState, n: number, cfg: SimConfig, inputs = new Map<number, Input>()) => {
  for (let i = 0; i < n; i++) s = step(s, inputs, cfg);
  return s;
};

describe('math', () => {
  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  it('turns along the shortest arc, clamped', () => {
    expect(turnToward(0, 1, 0.1)).toBeCloseTo(0.1);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1); // crosses PI, not back through 0
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05);
  });
});

describe('SpatialHash', () => {
  it('finds nearby items and skips distant ones', () => {
    const h = new SpatialHash(32);
    h.insert(1, 10, 10, 2);
    h.insert(2, 500, 500, 2);
    h.insert(3, -40, -40, 2);
    const found = new Set<number>();
    h.query(0, 0, 20, (i) => found.add(i));
    expect(found.has(1)).toBe(true);
    expect(found.has(2)).toBe(false);
    h.clear();
    found.clear();
    h.query(0, 0, 20, (i) => found.add(i));
    expect(found.size).toBe(0);
  });
});

describe('body', () => {
  it('samples segments at fixed spacing along the path', () => {
    const path = Array.from({ length: 101 }, (_, i) => ({ x: i, y: 0 }));
    const segs = sampleSegments(path, 50, 10);
    expect(segs.map((p) => Math.round(p.x))).toEqual([100, 90, 80, 70, 60, 50]);
  });
});

describe('movement', () => {
  it('moves forward at base speed', () => {
    const cfg = quiet();
    const s = run(soloGame(cfg), 30, cfg);
    expect(s.snakes[0]!.head.x).toBeCloseTo(cfg.baseSpeed, 0);
    expect(s.snakes[0]!.head.y).toBeCloseTo(0, 5);
  });

  it('limits turning to the turn rate', () => {
    const cfg = quiet();
    const s = step(soloGame(cfg), new Map([[1, { targetAngle: Math.PI / 2, boost: false }]]), cfg);
    const sn = s.snakes[0]!;
    expect(sn.angle).toBeCloseTo(cfg.turnRate * cfg.dt);
  });

  it('turns at the same rate whatever the mass', () => {
    const cfg = quiet();
    const small = soloGame(cfg);
    const big = soloGame(cfg);
    big.snakes[0]!.mass = 500;
    const input = new Map([[1, { targetAngle: Math.PI / 2, boost: false }]]);
    expect(step(big, input, cfg).snakes[0]!.angle).toBeCloseTo(step(small, input, cfg).snakes[0]!.angle);
  });

  it('does not mutate the previous state', () => {
    const cfg = quiet();
    const s0 = soloGame(cfg);
    step(s0, new Map(), cfg);
    expect(s0.tick).toBe(0);
    expect(s0.snakes[0]!.head.x).toBe(0);
  });

  it('keeps the body length tied to mass', () => {
    const cfg = quiet();
    const s = run(soloGame(cfg), 60, cfg);
    const sn = s.snakes[0]!;
    const expected = Math.floor((cfg.baseLength + sn.mass * cfg.lengthPerMass) / cfg.segmentSpacing) + 1;
    expect(sn.segments.length).toBe(expected);
  });
});

describe('boost', () => {
  it('doubles speed, burns mass and drops pellets', () => {
    const cfg = quiet();
    const boost = new Map([[1, { targetAngle: 0, boost: true }]]);
    const s = run(soloGame(cfg), 30, cfg, boost);
    const sn = s.snakes[0]!;
    expect(sn.head.x).toBeCloseTo(cfg.baseSpeed * cfg.boostMultiplier, 0);
    expect(sn.mass).toBeCloseTo(cfg.startMass - cfg.boostCostPerSecond, 5);
    expect(s.pellets.length).toBeGreaterThan(0);
  });

  it('stops at the minimum boost mass', () => {
    // A big arena, so the snake burns down to the minimum before it reaches the edge.
    const cfg = quiet({ arenaBaseRadius: 10_000 });
    const seconds = (cfg.startMass - cfg.minBoostMass) / cfg.boostCostPerSecond + 1;
    const s = run(soloGame(cfg), Math.ceil(seconds / cfg.dt), cfg, new Map([[1, { targetAngle: 0, boost: true }]]));
    expect(s.snakes[0]!.alive).toBe(true);
    expect(s.snakes[0]!.mass).toBeCloseTo(cfg.minBoostMass, 5);
  });
});

describe('pellets', () => {
  it('eating a pellet grows the snake and emits an event', () => {
    const cfg = quiet();
    const s0 = soloGame(cfg);
    s0.pellets.push({ id: 99, x: 10, y: 0, value: 3 });
    const s1 = step(s0, new Map(), cfg);
    expect(s1.pellets.length).toBe(0);
    expect(s1.snakes[0]!.mass).toBe(cfg.startMass + 3);
    expect(s1.events).toContainEqual({ type: 'eat', snakeId: 1, pelletId: 99, value: 3 });
  });

  it('respawns pellets toward the density target inside the arena', () => {
    const cfg = makeConfig({ shrinkSchedule: [] });
    const s = createGame([{ name: 'a' }, { name: 'b' }], cfg);
    expect(s.pellets.length).toBeGreaterThan(100);
    for (const p of s.pellets) expect(Math.hypot(p.x, p.y)).toBeLessThan(s.arena.radius);
  });
});

describe('collisions', () => {
  function twoSnakes(cfg: SimConfig): GameState {
    const s = createGame([{ name: 'a' }, { name: 'b' }], cfg);
    return s;
  }

  it('head into another body kills the mover only', () => {
    const cfg = quiet();
    const s0 = twoSnakes(cfg);
    // b lies along the y axis heading up; a drives into its middle from the left.
    s0.snakes[1] = createSnake(2, 'b', { x: 0, y: 200 }, Math.PI / 2, cfg);
    s0.snakes[0] = createSnake(1, 'a', { x: -30, y: 100 }, 0, cfg);
    const s = run(s0, 10, cfg);
    expect(s.snakes[0]!.alive).toBe(false);
    expect(s.snakes[1]!.alive).toBe(true);
    expect(s.finished).toBe(true);
    expect(s.winnerId).toBe(2);
  });

  it('dying drops the body as pellets', () => {
    const cfg = quiet();
    const s0 = twoSnakes(cfg);
    s0.snakes[1] = createSnake(2, 'b', { x: 0, y: 200 }, Math.PI / 2, cfg);
    s0.snakes[0] = createSnake(1, 'a', { x: -30, y: 100 }, 0, cfg);
    const s = run(s0, 10, cfg);
    const dropped = s.pellets.reduce((sum, p) => sum + p.value, 0);
    expect(dropped).toBeCloseTo(cfg.startMass * cfg.deathDropRatio, 5);
  });

  it('head-to-head: both-die', () => {
    const cfg = quiet({ headToHead: 'both-die' });
    const s0 = twoSnakes(cfg);
    s0.snakes[0] = createSnake(1, 'a', { x: -20, y: 0 }, 0, cfg);
    s0.snakes[1] = createSnake(2, 'b', { x: 20, y: 0 }, Math.PI, cfg);
    const s = run(s0, 5, cfg);
    expect(s.snakes.every((sn) => !sn.alive)).toBe(true);
    expect(s.finished).toBe(true);
    expect(s.winnerId).toBeNull();
  });

  it('head-to-head: bigger-wins', () => {
    const cfg = quiet({ headToHead: 'bigger-wins' });
    const s0 = twoSnakes(cfg);
    s0.snakes[0] = createSnake(1, 'a', { x: -20, y: 0 }, 0, cfg);
    s0.snakes[1] = createSnake(2, 'b', { x: 20, y: 0 }, Math.PI, cfg);
    s0.snakes[1]!.mass = 40;
    const s = run(s0, 5, cfg);
    expect(s.snakes[0]!.alive).toBe(false);
    expect(s.snakes[1]!.alive).toBe(true);
  });
});

describe('arena', () => {
  it('kills snakes that leave the circle', () => {
    const cfg = quiet();
    const s0 = soloGame(cfg);
    s0.snakes[0] = createSnake(1, 'p', { x: s0.arena.radius - 5, y: 0 }, 0, cfg);
    const s = step(s0, new Map(), cfg);
    expect(s.snakes[0]!.alive).toBe(false);
    expect(s.events).toContainEqual({ type: 'death', snakeId: 1, killerId: null, cause: 'arena' });
  });

  it('shrinks toward the scheduled radius', () => {
    const cfg = quiet({ shrinkSchedule: [{ atSecond: 1, radiusFactor: 0.5 }], shrinkSpeed: 1000 });
    let s = createGame([{ name: 'a' }], cfg);
    const start = s.arena.radius;
    s = run(s, 25, cfg);
    expect(s.arena.radius).toBe(start);
    s = run(s, 30, cfg);
    expect(s.arena.radius).toBeCloseTo(start * 0.5);
  });
});

describe('rocks', () => {
  it('are placed deterministically, clear of spawns, inside the arena', () => {
    const cfg = makeConfig({ pelletDensity: 0 });
    const players = Array.from({ length: 6 }, (_, i) => ({ name: `p${i}` }));
    const a = createGame(players, cfg, 5);
    const b = createGame(players, cfg, 5);
    expect(a.obstacles.length).toBeGreaterThan(0);
    expect(a.obstacles).toEqual(b.obstacles);
    for (const o of a.obstacles) {
      expect(Math.hypot(o.x, o.y) + o.radius).toBeLessThanOrEqual(a.arena.radius);
      for (const s of a.snakes) expect(Math.hypot(s.head.x - o.x, s.head.y - o.y)).toBeGreaterThan(o.radius + s.radius);
    }
  });

  it('kill a head that touches them, and spare a snake that misses', () => {
    const cfg = quiet();
    const hit = soloGame(cfg);
    hit.obstacles = [{ x: 30, y: 0, radius: 20 }];
    const s = run(hit, 1, cfg); // events only hold the latest step
    expect(s.snakes[0]!.alive).toBe(false);
    expect(s.events).toContainEqual({ type: 'death', snakeId: 1, killerId: null, cause: 'rock' });

    const miss = soloGame(cfg);
    miss.obstacles = [{ x: 30, y: 200, radius: 20 }];
    expect(run(miss, 2, cfg).snakes[0]!.alive).toBe(true);
  });

  it('no pellets spawn inside a rock', () => {
    const cfg = makeConfig({ pelletDensity: 50, obstacleDensity: 0 });
    const s = createGame([{ name: 'a' }], cfg);
    s.obstacles = [{ x: 0, y: 0, radius: 300 }];
    s.pellets = [];
    fillPellets(s, cfg, Infinity);
    expect(s.pellets.length).toBeGreaterThan(0);
    for (const p of s.pellets) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(300);
  });
});

describe('determinism and bots', () => {
  function playBots(seed: number, ticks: number, cfg: SimConfig): GameState {
    const players = Array.from({ length: 8 }, (_, i) => ({ name: `bot${i}`, isBot: true }));
    let s = createGame(players, cfg, seed);
    for (let i = 0; i < ticks && !s.finished; i++) s = step(s, botInputs(s, cfg), cfg);
    return s;
  }

  it('same seed and inputs give the same result', () => {
    const cfg = makeConfig();
    const a = playBots(7, 300, cfg);
    const b = playBots(7, 300, cfg);
    expect(a.snakes.map((s) => [s.head.x, s.head.y, s.mass])).toEqual(b.snakes.map((s) => [s.head.x, s.head.y, s.mass]));
  });

  it('a lone bot survives and eats without hitting the edge', () => {
    const cfg = makeConfig();
    let s = createGame([{ name: 'bot', isBot: true }], cfg);
    for (let i = 0; i < 30 * 60; i++) s = step(s, botInputs(s, cfg), cfg);
    expect(s.snakes[0]!.alive).toBe(true);
    expect(s.snakes[0]!.mass).toBeGreaterThan(cfg.startMass);
  });

  it('a full bot match ends with a winner as the arena shrinks', () => {
    const cfg = makeConfig({
      shrinkSchedule: [
        { atSecond: 30, radiusFactor: 0.75 },
        { atSecond: 75, radiusFactor: 0.5 },
        { atSecond: 120, radiusFactor: 0.3 },
        { atSecond: 165, radiusFactor: 0.15 },
      ],
    });
    const s = playBots(3, 30 * 240, cfg);
    expect(s.finished).toBe(true);
  }, 30_000); // simulates up to 4 minutes of an 8-bot match
});
