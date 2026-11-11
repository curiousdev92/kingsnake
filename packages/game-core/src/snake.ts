import type { SimConfig } from './config';
import type { Vec2 } from './math';
import type { Snake, SnakeId } from './types';

export function radiusForMass(mass: number, cfg: SimConfig): number {
  return cfg.baseRadius + Math.sqrt(Math.max(0, mass)) * cfg.radiusPerSqrtMass;
}

export function bodyLengthForMass(mass: number, cfg: SimConfig): number {
  return cfg.baseLength + Math.max(0, mass) * cfg.lengthPerMass;
}

export function turnRateForMass(mass: number, cfg: SimConfig): number {
  return cfg.baseTurnRate / (1 + mass / cfg.turnRateMassFalloff);
}

/**
 * Drops path points the body no longer needs, keeping one spacing of slack
 * so segment sampling never runs off the end.
 */
export function trimPath(path: Vec2[], length: number): void {
  let acc = 0;
  for (let i = path.length - 1; i > 0; i--) {
    const a = path[i]!;
    const b = path[i - 1]!;
    acc += Math.hypot(a.x - b.x, a.y - b.y);
    if (acc > length) {
      if (i - 1 > 0) path.splice(0, i - 1);
      return;
    }
  }
}

/** Samples circles every `spacing` units backward along `path`, covering `length`. */
export function sampleSegments(path: Vec2[], length: number, spacing: number): Vec2[] {
  const out: Vec2[] = [];
  const last = path[path.length - 1];
  if (!last) return out;
  out.push({ x: last.x, y: last.y });
  let need = spacing; // distance from head to the next sample
  let walked = 0;
  for (let i = path.length - 1; i > 0 && need <= length; i--) {
    const a = path[i]!;
    const b = path[i - 1]!;
    const seg = Math.hypot(a.x - b.x, a.y - b.y);
    while (seg > 0 && walked + seg >= need && need <= length) {
      const t = (need - walked) / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      need += spacing;
    }
    walked += seg;
  }
  return out;
}

export function createSnake(
  id: SnakeId,
  name: string,
  head: Vec2,
  angle: number,
  cfg: SimConfig,
  isBot = false,
): Snake {
  const length = bodyLengthForMass(cfg.startMass, cfg);
  // Lay the starting body out straight behind the head.
  const path: Vec2[] = [];
  const steps = Math.ceil(length / cfg.segmentSpacing) + 1;
  for (let i = steps; i >= 0; i--) {
    const d = i * cfg.segmentSpacing;
    path.push({ x: head.x - Math.cos(angle) * d, y: head.y - Math.sin(angle) * d });
  }
  return {
    id,
    name,
    isBot,
    head: { x: head.x, y: head.y },
    angle,
    targetAngle: angle,
    speed: cfg.baseSpeed,
    boosting: false,
    mass: cfg.startMass,
    path,
    segments: sampleSegments(path, length, cfg.segmentSpacing),
    radius: radiusForMass(cfg.startMass, cfg),
    alive: true,
    boostDebt: 0,
  };
}
