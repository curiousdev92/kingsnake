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

export const defaultConfig: SimConfig = {
  dt: 1 / 30,
  baseSpeed: 170,
  boostMultiplier: 2,
  boostCostPerSecond: 6,
  minBoostMass: 12,
  baseTurnRate: 5,
  turnRateMassFalloff: 250,
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
  arenaPerPlayer: 140,
  shrinkSchedule: [
    { atSecond: 30, radiusFactor: 0.75 },
    { atSecond: 75, radiusFactor: 0.5 },
    { atSecond: 120, radiusFactor: 0.3 },
    { atSecond: 165, radiusFactor: 0.15 },
  ],
  shrinkSpeed: 12,
  headToHead: 'both-die',
};

export function makeConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return { ...defaultConfig, ...overrides };
}
