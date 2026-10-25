import { describe, expect, it } from 'vitest';
import { START_RATING, previousSeason, seasonAt, seasonById, seasonStartRating, seasonTier } from '../src';

describe('seasons', () => {
  it('are UTC calendar months', () => {
    const s = seasonAt(new Date('2026-10-25T12:00:00Z'));
    expect(s).toEqual({ id: '2026-10', name: 'October 2026', startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z' });
    expect(seasonAt(new Date('2026-10-31T23:59:59Z')).id).toBe('2026-10');
    expect(seasonAt(new Date('2026-11-01T00:00:00Z')).id).toBe('2026-11');
  });

  it('step back across years and parse ids', () => {
    expect(previousSeason(seasonById('2027-01')!).id).toBe('2026-12');
    expect(seasonById('2026-13')).toBeNull();
    expect(seasonById('nope')).toBeNull();
  });

  it('soft-reset ratings and tier rewards', () => {
    expect(seasonStartRating(null)).toBe(START_RATING);
    expect(seasonStartRating(1400)).toBe(1200);
    expect(seasonStartRating(800)).toBe(900);
    expect(seasonTier(1550).name).toBe('Diamond');
    expect(seasonTier(1000).name).toBe('Bronze');
  });
});
