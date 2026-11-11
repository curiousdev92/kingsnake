import { makeConfig, type SimConfig } from '@snake/game-core';
import { duel } from './duel';
import { ffa } from './ffa';
import type { GameMode } from './types';

export type { GameMode } from './types';
export { duel, ffa };

/** Every playable mode, in menu order. A new mode is one file plus a line here. */
export const MODES: readonly GameMode[] = [ffa, duel];
export const DEFAULT_MODE = ffa;

/** The mode with this id, or the default for unknown/missing ids (ids come from clients). */
export function getMode(id: unknown): GameMode {
  return MODES.find((m) => m.id === id) ?? DEFAULT_MODE;
}

/** The mode a room name serves (see GameMode.room), or the default. */
export function modeForRoom(room: string): GameMode {
  return MODES.find((m) => m.room === room) ?? DEFAULT_MODE;
}

/** Ranked modes matchmake public games through a rating queue room; others have none. */
export function queueRoomName(mode: GameMode): string | null {
  return mode.ranked ? `${mode.room}-queue` : null;
}

export function modeConfig(mode: GameMode, overrides: Partial<SimConfig> = {}): SimConfig {
  return makeConfig({ ...mode.sim, ...overrides });
}
