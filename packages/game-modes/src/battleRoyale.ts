import type { GameMode } from './types';

/**
 * Battle Royale: the free-for-all field, but the arena closes in on a schedule, so
 * everyone is pushed together and every match ends with one winner.
 */
export const battleRoyale: GameMode = {
  id: 'battleroyale',
  room: 'battleroyale',
  name: 'Battle Royale',
  description: 'Twenty snakes, the arena keeps shrinking',
  maxPlayers: 20,
  maxPrivateSnakes: 20,
  ranked: false,
  sim: {
    shrinkSchedule: [
      { atSecond: 30, radiusFactor: 0.75 },
      { atSecond: 75, radiusFactor: 0.5 },
      { atSecond: 120, radiusFactor: 0.3 },
      { atSecond: 165, radiusFactor: 0.15 },
    ],
  },
};
