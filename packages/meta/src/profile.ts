import type { SeasonStanding } from './season';

export const MAX_NAME_LENGTH = 16;

/** Letters, digits, space and `_.-`, trimmed to 16 characters. Empty when nothing usable is left. */
export function sanitizeName(name: unknown): string {
  return typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, MAX_NAME_LENGTH).trim() : '';
}

/** A player's profile as the API returns it. */
export interface Profile {
  id: string;
  name: string;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  coins: number;
  /** Ranked duel rating (Elo) this season. */
  rating: number;
  /** This season's ranked standing. */
  season: SeasonStanding;
  /** Last season's reward, while it is waiting to be claimed. */
  seasonReward: SeasonReward | null;
  equippedSkin: string;
  /** Owned skin ids, free ones included. */
  owned: string[];
  daily: {
    available: boolean;
    /** Streak that today's claim would continue (or did). */
    streak: number;
    /** Coins today's claim gives. */
    reward: number;
  };
}

/** End-of-season reward for one player. */
export interface SeasonReward {
  standing: SeasonStanding;
  tier: string;
  coins: number;
}

/** What a match result grants one player; forwarded to the client at match end. */
export interface Grant {
  xp: number;
  coins: number;
  levelBefore: number;
  levelAfter: number;
  /** Ranked matches only: the duel rating before and after. */
  rating?: { before: number; after: number };
}

/** One player's line in the game-server's match report to the API. */
export interface MatchResultEntry {
  playerId: string;
  placement: number;
  kills: number;
  survivalMs: number;
}

export interface MatchReport {
  /** Unique per match; rewards are granted at most once per (matchId, playerId). */
  matchId: string;
  totalPlayers: number;
  /** Ranked duel: exactly two account holders, no bots. The API then updates both ratings. */
  ranked?: boolean;
  results: MatchResultEntry[];
}
