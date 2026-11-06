import type { GameMode } from './types';

/** Free-for-all: twenty snakes, last one alive wins. A fixed-size arena that never shrinks. The default. */
export const ffa: GameMode = {
  id: 'ffa',
  room: 'arena',
  name: 'Free-for-all',
  description: 'Twenty snakes, last one alive wins',
  maxPlayers: 20,
  maxPrivateSnakes: 20,
  ranked: false,
  sim: {},
};
