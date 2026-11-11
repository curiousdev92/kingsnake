import { START_RATING } from './rating';

/**
 * Ranked seasons are calendar months (UTC). Each season has its own duel rating and
 * leaderboard; when it ends, players claim a coin reward by their final rating.
 */
export interface Season {
  /** `YYYY-MM`, e.g. `2026-10`. */
  id: string;
  /** Display name, e.g. `October 2026`. */
  name: string;
  startsAt: string;
  endsAt: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SEASON_ID = /^(\d{4})-(\d{2})$/;

function seasonFromMonth(year: number, month: number): Season {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  return {
    id: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
    name: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

export function seasonAt(date: Date): Season {
  return seasonFromMonth(date.getUTCFullYear(), date.getUTCMonth());
}

/** The season with this id, or null for malformed ids. */
export function seasonById(id: unknown): Season | null {
  const m = typeof id === 'string' ? SEASON_ID.exec(id) : null;
  if (!m) return null;
  const month = Number(m[2]) - 1;
  return month >= 0 && month < 12 ? seasonFromMonth(Number(m[1]), month) : null;
}

export function previousSeason(s: Season): Season {
  const start = new Date(s.startsAt);
  return seasonFromMonth(start.getUTCFullYear(), start.getUTCMonth() - 1);
}

/** Soft reset: a new season starts halfway between last season's rating and the start rating. */
export function seasonStartRating(lastSeasonRating: number | null): number {
  return lastSeasonRating === null ? START_RATING : Math.round((lastSeasonRating + START_RATING) / 2);
}

/** End-of-season coins by final rating; only players who played a ranked match get one. */
export const SEASON_REWARD_TIERS: readonly { minRating: number; name: string; coins: number }[] = [
  { minRating: 1500, name: 'Diamond', coins: 600 },
  { minRating: 1300, name: 'Gold', coins: 300 },
  { minRating: 1100, name: 'Silver', coins: 150 },
  { minRating: 0, name: 'Bronze', coins: 60 },
];

export function seasonTier(rating: number): { name: string; coins: number } {
  return SEASON_REWARD_TIERS.find((t) => rating >= t.minRating)!;
}

/** A player's standing in one season. */
export interface SeasonStanding {
  season: Season;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  /** 1-based position on the season leaderboard, or null before the first ranked match. */
  rank: number | null;
}

/** One line of a season leaderboard (`GET /leaderboard`). */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  skin: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  /** True for the requesting player. */
  you: boolean;
}

export interface Leaderboard {
  season: Season;
  top: LeaderboardEntry[];
  /** The viewer's own line (also when outside the top), or null if anonymous or unranked. */
  you: LeaderboardEntry | null;
}
