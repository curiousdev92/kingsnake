import { describe, expect, it } from 'vitest';
import { pairPlayers, ratingWindow, window, type Waiting } from '../src/matchmaking';

const w = (id: string, rating: number, since = 0): Waiting => ({ id, rating, since });
const ids = (pairs: [Waiting, Waiting][]) => pairs.map(([a, b]) => [a.id, b.id].sort().join('+')).sort();

describe('ranked matchmaking', () => {
  it('pairs close ratings and leaves far ones waiting', () => {
    expect(ids(pairPlayers([w('a', 1000), w('b', 1500), w('c', 1050)], 0))).toEqual(['a+c']);
  });

  it('prefers the closest opponent', () => {
    expect(ids(pairPlayers([w('a', 1000), w('b', 1090), w('c', 1010)], 0))).toEqual(['a+c']);
  });

  it('widens the window with waiting time, then takes anyone', () => {
    const q = [w('a', 1000), w('b', 1300)];
    expect(pairPlayers(q, 0)).toEqual([]);
    expect(ratingWindow(8_000)).toBe(300);
    expect(ids(pairPlayers(q, 8_000))).toEqual(['a+b']);
    expect(ids(pairPlayers([w('a', 100), w('b', 3000)], window.anyoneAfterMs))).toEqual(['a+b']);
  });

  it('lets a patient player take a newcomer', () => {
    // 'old' has waited 10 s (window 350); the newcomer's own window is only 100.
    expect(ids(pairPlayers([w('old', 1000, 0), w('new', 1300, 10_000)], 10_000))).toEqual(['new+old']);
  });

  it('never pairs anyone twice', () => {
    const pairs = pairPlayers([w('a', 1000), w('b', 1000), w('c', 1000), w('d', 1000), w('e', 1000)], 0);
    expect(pairs).toHaveLength(2);
    expect(new Set(pairs.flat().map((p) => p.id)).size).toBe(4);
  });
});
