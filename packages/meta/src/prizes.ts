import type { Season } from './season';

/**
 * Prizes per leaderboard:
 * - Overall (all time): none.
 * - Monthly (XP, every mode): cash for the top three, below.
 * - 1v1 Duels (this season's rating): game bonuses, see SEASON_REWARD_TIERS (coins and exclusive skins).
 *
 * Cash is never paid by the game itself. Winners claim a prize by leaving payout details;
 * the owner pays them and marks it paid (`/internal/monthly-prizes`).
 */
export const MONTHLY_PRIZES: readonly { rank: number; amountUsd: number }[] = [
  { rank: 1, amountUsd: 50 },
  { rank: 2, amountUsd: 25 },
  { rank: 3, amountUsd: 10 },
];

/** The prize for finishing this position (1-based) on a monthly board, or null. */
export function monthlyPrizeFor(rank: number): number | null {
  return MONTHLY_PRIZES.find((p) => p.rank === rank)?.amountUsd ?? null;
}

/** 'unclaimed': won, no payout details yet. 'requested': details sent, waiting for payment. 'paid': done. */
export type PrizeStatus = 'unclaimed' | 'requested' | 'paid';

/** A cash prize won on a finished month's board. */
export interface MonthlyPrize {
  month: Season;
  rank: number;
  amountUsd: number;
  status: PrizeStatus;
}

export const MAX_PAYOUT_DETAILS = 200;
