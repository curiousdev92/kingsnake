import { describe, expect, it } from 'vitest';
import { FREE_SKINS, SKINS, dailyReward, levelFromXp, matchReward, nextStreak, xpToNext } from '../src';

describe('skins', () => {
  it('have unique ids, valid colours and a free default', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    for (const s of SKINS) for (const c of s.palette) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(FREE_SKINS).toContain('classic');
  });
});

describe('levels', () => {
  it('walks the XP curve', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNext: 100 });
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100)).toEqual({ level: 2, xpIntoLevel: 0, xpForNext: 150 });
    expect(levelFromXp(100 + 150 + 10)).toEqual({ level: 3, xpIntoLevel: 10, xpForNext: xpToNext(3) });
  });
});

describe('match rewards', () => {
  const base = { totalPlayers: 8, kills: 0, survivalMs: 60_000 };

  it('pays more for better placement, kills and survival', () => {
    const last = matchReward({ ...base, placement: 8 });
    const winner = matchReward({ ...base, placement: 1 });
    expect(winner.xp).toBeGreaterThan(last.xp);
    expect(winner.coins).toBeGreaterThan(last.coins);
    expect(matchReward({ ...base, placement: 8, kills: 2 }).xp).toBe(last.xp + 30);
  });

  it('caps survival XP and clamps bad input', () => {
    const long = matchReward({ ...base, placement: 4, survivalMs: 60 * 60_000 });
    const capped = matchReward({ ...base, placement: 4, survivalMs: 5 * 60_000 });
    expect(long).toEqual(capped);
    expect(matchReward({ placement: -3, totalPlayers: 0, kills: -1, survivalMs: -5 })).toEqual({ xp: 10, coins: 30 });
  });
});

describe('daily rewards', () => {
  it('grows to day 7 then holds', () => {
    expect(dailyReward(1)).toBe(20);
    expect(dailyReward(7)).toBe(80);
    expect(dailyReward(30)).toBe(80);
  });

  it('continues the streak only from yesterday', () => {
    expect(nextStreak(null, 0, '2026-10-25')).toBe(1);
    expect(nextStreak('2026-10-24', 3, '2026-10-25')).toBe(4);
    expect(nextStreak('2026-10-20', 3, '2026-10-25')).toBe(1);
    expect(nextStreak('2026-10-25', 3, '2026-10-25')).toBeNull();
    expect(nextStreak('2026-02-28', 1, '2026-03-01')).toBe(2); // month boundary
  });
});
