import type { SimConfig } from '@snake/game-core';

/**
 * A game mode is data: who plays and how the simulation is tuned. Rooms, netcode and
 * rendering read it and need no changes per mode. When a mode needs different rules
 * (timed score, teams), add optional hooks here and to game-core's step.
 */
export interface GameMode {
  id: string;
  /** Colyseus room name. Matchmaking never mixes room names, and the server derives the mode from it. */
  room: string;
  name: string;
  /** One line for menus. */
  description: string;
  /** Snakes per match: public rooms fill up to this with bots, and it caps humans per room. */
  maxPlayers: number;
  /** Public matches between two account holders change their rating. Private rooms never do. */
  ranked: boolean;
  /** Private rooms: humans plus bots the host may add. */
  maxPrivateSnakes: number;
  /** Overrides on top of game-core's defaults. */
  sim: Partial<SimConfig>;
}
