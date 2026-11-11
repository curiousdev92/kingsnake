import type { SimConfig } from './config';
import { dist2, wrapAngle } from './math';
import { SpatialHash } from './spatialHash';
import type { GameState, Input, Pellet, Snake } from './types';
import { touchesObstacle } from './world';

const CANDIDATES = 11;
const SPREAD = 0.32; // radians between candidate headings
const PROBES = [30, 60, 100, 150];
const FOOD_RANGE = 450;

/**
 * Simple deterministic bot: scores a fan of headings by danger (other bodies, arena
 * edge) and food, then steers toward the best. Pure function of the state.
 */
export function botInput(state: GameState, bot: Snake, cfg: SimConfig): Input {
  const food = nearestFood(state, bot);
  const foodAngle = food ? Math.atan2(food.y - bot.head.y, food.x - bot.head.x) : bot.angle;
  const { center, radius } = state.arena;
  const edge = radius - bot.radius * 3 - 40;
  const centerAngle = Math.atan2(center.y - bot.head.y, center.x - bot.head.x);
  // Pull toward the center grows as the bot nears the edge.
  const centerWeight = (Math.hypot(bot.head.x - center.x, bot.head.y - center.y) / radius) * 0.8;

  let bestAngle = bot.angle;
  let bestScore = -Infinity;
  let bestDanger = 0;
  for (let c = 0; c < CANDIDATES; c++) {
    const offset = (c - (CANDIDATES - 1) / 2) * SPREAD;
    const angle = wrapAngle(bot.angle + offset);
    let danger = 0;
    for (const d of PROBES) {
      const px = bot.head.x + Math.cos(angle) * d;
      const py = bot.head.y + Math.sin(angle) * d;
      const weight = 200 / d;
      if (dist2(px, py, center.x, center.y) > edge * edge) danger += weight;
      if (hitsBody(state, bot, px, py)) danger += weight * 2;
      if (touchesObstacle(state.obstacles, px, py, bot.radius + 8)) danger += weight * 3;
    }
    const score =
      -danger * 10 +
      Math.cos(wrapAngle(angle - foodAngle)) +
      Math.cos(wrapAngle(angle - centerAngle)) * centerWeight -
      Math.abs(offset) * 0.05;
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
      bestDanger = danger;
    }
  }

  const rich = food !== null && food.value > cfg.pelletValue * 1.5;
  const boost = bestDanger === 0 && rich && bot.mass > cfg.minBoostMass * 2.5;
  return { targetAngle: bestAngle, boost };
}

function nearestFood(state: GameState, bot: Snake): Pellet | null {
  let best: Pellet | null = null;
  let bestScore = Infinity;
  const fwdX = Math.cos(bot.angle);
  const fwdY = Math.sin(bot.angle);
  for (const p of state.pellets) {
    const dx = p.x - bot.head.x;
    const dy = p.y - bot.head.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > FOOD_RANGE * FOOD_RANGE) continue;
    const d = Math.sqrt(d2);
    // Favor pellets ahead of the bot and bigger pellets.
    const ahead = (dx * fwdX + dy * fwdY) / (d + 1);
    const score = (d * (1.6 - ahead * 0.6)) / Math.sqrt(p.value);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// Every living body segment, indexed once per state. Checking each probe against every
// segment of every snake cost millions of distance tests per tick with big snakes.
const bodyHash = new SpatialHash(64);
// bodyHash item i -> owner snake index at [2i], segment index at [2i + 1].
const bodyOwner: number[] = [];
let indexed: GameState | null = null;

function indexBodies(state: GameState): void {
  if (indexed === state) return;
  indexed = state;
  bodyHash.clear();
  bodyOwner.length = 0;
  const snakes = state.snakes;
  for (let si = 0; si < snakes.length; si++) {
    const s = snakes[si]!;
    if (!s.alive) continue;
    for (let k = 0; k < s.segments.length; k++) {
      const seg = s.segments[k]!;
      bodyHash.insert(bodyOwner.length >> 1, seg.x, seg.y, s.radius);
      bodyOwner.push(si, k);
    }
  }
}

function hitsBody(state: GameState, bot: Snake, x: number, y: number): boolean {
  indexBodies(state);
  // A segment of radius r is hit when within r + bot.radius + 6. Its cells cover its own
  // circle, so querying the probe's (bot.radius + 6) circle finds every candidate.
  return bodyHash.any(x, y, bot.radius + 6, (item) => {
    const other = state.snakes[bodyOwner[item * 2]!]!;
    if (other === bot) return false;
    const seg = other.segments[bodyOwner[item * 2 + 1]!]!;
    const r = other.radius + bot.radius + 6;
    return dist2(x, y, seg.x, seg.y) < r * r;
  });
}

/** Inputs for every living bot in the state. */
export function botInputs(state: GameState, cfg: SimConfig, into = new Map<number, Input>()): Map<number, Input> {
  for (const s of state.snakes) if (s.alive && s.isBot) into.set(s.id, botInput(state, s, cfg));
  return into;
}
