import { describe, expect, it } from 'vitest';
import { MIN_RATING, START_RATING, applyRating, expectedScore, ratingDelta } from '../src';

describe('rating', () => {
  it('is symmetric and zero-sum between equals', () => {
    expect(expectedScore(START_RATING, START_RATING)).toBe(0.5);
    expect(ratingDelta(1000, 1000, 1)).toBe(16);
    expect(ratingDelta(1000, 1000, 0)).toBe(-16);
  });

  it('pays more for an upset than for an expected win', () => {
    expect(ratingDelta(900, 1300, 1)).toBeGreaterThan(ratingDelta(1300, 900, 1));
    expect(ratingDelta(1300, 900, 1)).toBeGreaterThan(0);
  });

  it('never drops below the floor', () => {
    expect(applyRating(MIN_RATING + 5, -20)).toBe(MIN_RATING);
  });
});
