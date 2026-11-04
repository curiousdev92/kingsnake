export interface ShrinkStep {
  /** Seconds after match start when this step begins. */
  atSecond: number;
  /** Target radius as a fraction of the starting radius. */
  radiusFactor: number;
}

export interface SimConfig {
  /** Fixed step in seconds. */
  dt: number;
  baseSpeed: number;
  boostMultiplier: number;
  /** Mass burned per second while boosting. */
  boostCostPerSecond: number;
  /** Boost is unavailable below this mass. */
  minBoostMass: number;
  /** Radians per second for a starting-size snake. */
  baseTurnRate: number;
  /** Turn rate is divided by (1 + mass / turnRateMassFalloff). */
  turnRateMassFalloff: number;
  startMass: number;
  segmentSpacing: number;
  /** Body length in world units = baseLength + mass * lengthPerMass. */
  baseLength: number;
  lengthPerMass: number;
  baseRadius: number;
  /** Radius = baseRadius + sqrt(mass) * radiusPerSqrtMass. */
  radiusPerSqrtMass: number;
  /** Extra reach beyond the head radius for eating pellets. */
  eatReach: number;
  pelletRadius: number;
  pelletValue: number;
  /** Pellets per 10,000 square units of arena. */
  pelletDensity: number;
  maxPelletSpawnsPerTick: number;
  /** Fraction of a dead snake's mass that becomes pellets. */
  deathDropRatio: number;
  arenaBaseRadius: number;
  arenaPerPlayer: number;
  shrinkSchedule: ShrinkStep[];
  /** World units per second the arena edge moves toward its target. */
  shrinkSpeed: number;
  headToHead: 'both-die' | 'bigger-wins';
}

/**
 * The game's fixed tuning, the same for every player and match. It is frozen: the
 * server sends it to clients for prediction, and nothing in a client may change it.
 * Modes only adjust the arena and head-to-head rule (see @snake/game-modes).
 */
export const defaultConfig: Readonly<SimConfig> = deepFreeze({
  dt: 1 / 30,
  baseSpeed: 200,
  boostMultiplier: 2,
  boostCostPerSecond: 2,
  minBoostMass: 12,
  baseTurnRate: 12,
  // Starting snakes (mass 20) turn at ~10 rad/s, mass 200 at ~4.5, mass 1000 at ~1.3,
  // so big snakes trade agility for reach.
  turnRateMassFalloff: 120,
  startMass: 20,
  segmentSpacing: 9,
  baseLength: 60,
  lengthPerMass: 5,
  baseRadius: 7,
  radiusPerSqrtMass: 0.7,
  eatReach: 14,
  pelletRadius: 4,
  pelletValue: 1,
  pelletDensity: 1.6,
  maxPelletSpawnsPerTick: 6,
  deathDropRatio: 0.8,
  arenaBaseRadius: 900,
  // 20-snake rooms: 900 + 20 × 90 = 2700 units, keeping pellet counts manageable.
  arenaPerPlayer: 90,
  shrinkSchedule: [
    { atSecond: 30, radiusFactor: 0.75 },
    { atSecond: 75, radiusFactor: 0.5 },
    { atSecond: 120, radiusFactor: 0.3 },
    { atSecond: 165, radiusFactor: 0.15 },
  ],
  shrinkSpeed: 12,
  headToHead: 'both-die',
});

function deepFreeze<T extends object>(value: T): T {
  for (const v of Object.values(value)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(value);
}

/** A config for modes and tests: the fixed tuning plus overrides. */
export function makeConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return { ...defaultConfig, ...overrides };
}
