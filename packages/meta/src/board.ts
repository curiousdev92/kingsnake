import type { Season } from './season';

/**
 * Score boards rank players by the XP their matches earned, across every mode
 * (see `matchReward`: kills, time survived and placement all count). The "overall"
 * board adds up all time; the "monthly" board adds up one UTC calendar month.
 * Ranked duel ratings have their own board (see season.ts).
 */
export type ScoreBoardKind = 'overall' | 'monthly';

/** One line of a score board (`GET /leaderboard/overall` and `/leaderboard/monthly`). */
export interface ScoreEntry {
  rank: number;
  name: string;
  skin: string;
  /** XP earned in the board's period. */
  score: number;
  matches: number;
  wins: number;
  kills: number;
  /** True for the requesting player. */
  you: boolean;
}

export interface ScoreBoard {
  kind: ScoreBoardKind;
  /** The month a monthly board covers; null for all time. */
  season: Season | null;
  top: ScoreEntry[];
  /** The viewer's own line (also when outside the top), or null if anonymous or no matches in the period. */
  you: ScoreEntry | null;
}
