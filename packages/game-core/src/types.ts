import type { Vec2 } from './math';

export type SnakeId = number;

export interface Snake {
  id: SnakeId;
  name: string;
  isBot: boolean;
  head: Vec2;
  angle: number;
  targetAngle: number;
  speed: number;
  boosting: boolean;
  mass: number;
  /** Recent head positions, oldest first; the last entry equals `head`. */
  path: Vec2[];
  /** Body circles sampled along `path` at a fixed spacing; index 0 is the head. */
  segments: Vec2[];
  radius: number;
  alive: boolean;
  /** Mass burned by boosting that has not yet been dropped as a pellet. */
  boostDebt: number;
}

export interface Pellet {
  id: number;
  x: number;
  y: number;
  value: number;
}

export interface Arena {
  center: Vec2;
  radius: number;
  startRadius: number;
  targetRadius: number;
}

export interface Input {
  targetAngle: number;
  boost: boolean;
}

export type GameEvent =
  | { type: 'eat'; snakeId: SnakeId; pelletId: number; value: number }
  | { type: 'death'; snakeId: SnakeId; killerId: SnakeId | null; cause: 'body' | 'head' | 'arena' }
  | { type: 'win'; snakeId: SnakeId | null };

export interface GameState {
  tick: number;
  snakes: Snake[];
  pellets: Pellet[];
  arena: Arena;
  nextPelletId: number;
  seed: number;
  /** Set once the match is decided. `null` winner means everyone died on the same tick. */
  finished: boolean;
  winnerId: SnakeId | null;
  /** Events produced by the most recent step only. */
  events: GameEvent[];
}
