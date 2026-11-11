import { createGame, step, type Input } from '@snake/game-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODE, MODES, duel, getMode, modeConfig } from '../src';

describe('game modes', () => {
  it('have unique ids and sane sizes', () => {
    expect(new Set(MODES.map((m) => m.id)).size).toBe(MODES.length);
    for (const m of MODES) expect(m.maxPlayers).toBeGreaterThanOrEqual(2);
  });

  it('fall back to the default for unknown ids', () => {
    expect(getMode('duel')).toBe(duel);
    expect(getMode('nope')).toBe(DEFAULT_MODE);
    expect(getMode(undefined)).toBe(DEFAULT_MODE);
  });

  it('duel runs a two-snake match in a smaller arena to a winner', () => {
    const cfg = modeConfig(duel);
    const state0 = createGame([{ name: 'a' }, { name: 'b' }], cfg, 7);
    expect(state0.arena.radius).toBe(520);
    let state = state0;
    const idle = new Map<number, Input>();
    for (let i = 0; i < 30 * 200 && !state.finished; i++) state = step(state, idle, cfg);
    expect(state.finished).toBe(true);
  });
});
