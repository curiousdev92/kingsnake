import type { GameMode } from './types';

/**
 * 1v1 Duel: a small arena that closes in fast, so fights start early and nobody can
 * hide. Head-on collisions go to the bigger snake, which rewards eating over stalling.
 */
export const duel: GameMode = {
  id: 'duel',
  room: 'duel',
  name: '1v1 Duel',
  description: 'Two snakes, a small arena that closes fast',
  maxPlayers: 2,
  maxPrivateSnakes: 2,
  sim: {
    arenaBaseRadius: 520,
    arenaPerPlayer: 0,
    shrinkSchedule: [
      { atSecond: 20, radiusFactor: 0.7 },
      { atSecond: 45, radiusFactor: 0.45 },
      { atSecond: 70, radiusFactor: 0.25 },
      { atSecond: 95, radiusFactor: 0.12 },
    ],
    headToHead: 'bigger-wins',
  },
};
