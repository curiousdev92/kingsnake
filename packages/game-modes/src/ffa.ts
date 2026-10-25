import type { GameMode } from './types';

/** Free-for-all: eight snakes, last one alive wins. The default. */
export const ffa: GameMode = {
  id: 'ffa',
  room: 'arena',
  name: 'Free-for-all',
  description: 'Eight snakes, last one alive wins',
  maxPlayers: 8,
  maxPrivateSnakes: 16,
  sim: {},
};
