import {
  previousSeason,
  seasonStartRating,
  seasonTier,
  type LeaderboardEntry,
  type Season,
  type SeasonReward,
  type SeasonStanding,
} from '@snake/meta';
import type { Db } from './db';
import { ApiError } from './errors';

interface SeasonRow {
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  reward_claimed: boolean;
}

async function seasonRow(db: Db, season: Season, playerId: string, lock = false): Promise<SeasonRow | null> {
  const rows = await db.query<SeasonRow>(
    `SELECT rating, wins, losses, draws, reward_claimed FROM season_ratings WHERE season_id = $1 AND player_id = $2${lock ? ' FOR UPDATE' : ''}`,
    [season.id, playerId],
  );
  return rows[0] ?? null;
}

/** A player's rating at the start of `season`: soft-reset from last season's, if they played. */
async function startRating(db: Db, season: Season, playerId: string): Promise<number> {
  return seasonStartRating((await seasonRow(db, previousSeason(season), playerId))?.rating ?? null);
}

/** Current rating in `season`, whether or not they have played it yet. */
export async function seasonRating(db: Db, season: Season, playerId: string): Promise<number> {
  return (await seasonRow(db, season, playerId))?.rating ?? startRating(db, season, playerId);
}

/** 1-based leaderboard position; ties share a rank. */
async function rankOf(db: Db, season: Season, rating: number): Promise<number> {
  const [row] = await db.query<{ above: number }>('SELECT count(*)::int AS above FROM season_ratings WHERE season_id = $1 AND rating > $2', [season.id, rating]);
  return row!.above + 1;
}

export async function standing(db: Db, season: Season, playerId: string): Promise<SeasonStanding> {
  const row = await seasonRow(db, season, playerId);
  if (!row) return { season, rating: await startRating(db, season, playerId), wins: 0, losses: 0, draws: 0, rank: null };
  return { season, rating: row.rating, wins: row.wins, losses: row.losses, draws: row.draws, rank: await rankOf(db, season, row.rating) };
}

/**
 * Locks the player's row for `season` inside a transaction, creating it at the
 * soft-reset start rating on their first ranked match of the season.
 */
export async function lockSeasonRating(tx: Db, season: Season, playerId: string): Promise<number> {
  const start = await startRating(tx, season, playerId);
  await tx.query('INSERT INTO season_ratings (season_id, player_id, rating) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [season.id, playerId, start]);
  return (await seasonRow(tx, season, playerId, true))!.rating;
}

/** Records one ranked result; the row must be locked with lockSeasonRating. */
export async function recordSeasonResult(tx: Db, season: Season, playerId: string, rating: number, score: number): Promise<void> {
  await tx.query(
    `UPDATE season_ratings SET rating = $3, wins = wins + $4, losses = losses + $5, draws = draws + $6, updated_at = now()
     WHERE season_id = $1 AND player_id = $2`,
    [season.id, playerId, rating, score === 1 ? 1 : 0, score === 0 ? 1 : 0, score === 0.5 ? 1 : 0],
  );
}

/** Last season's reward, if they played it and haven't claimed it. */
export async function pendingSeasonReward(db: Db, current: Season, playerId: string): Promise<SeasonReward | null> {
  const last = previousSeason(current);
  const row = await seasonRow(db, last, playerId);
  if (!row || row.reward_claimed) return null;
  const tier = seasonTier(row.rating);
  return {
    standing: { season: last, rating: row.rating, wins: row.wins, losses: row.losses, draws: row.draws, rank: await rankOf(db, last, row.rating) },
    tier: tier.name,
    coins: tier.coins,
  };
}

/** Pays last season's reward once. */
export async function claimSeasonReward(db: Db, current: Season, playerId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const last = previousSeason(current);
    const row = await seasonRow(tx, last, playerId, true);
    if (!row || row.reward_claimed) throw new ApiError(409, 'nothing_to_claim', 'No season reward to claim');
    const { coins } = seasonTier(row.rating);
    await tx.query('UPDATE season_ratings SET reward_claimed = true WHERE season_id = $1 AND player_id = $2', [last.id, playerId]);
    await tx.query('UPDATE players SET coins = coins + $2 WHERE id = $1', [playerId, coins]);
    return coins;
  });
}

const leaderboardSelect = `
  SELECT p.id, p.name, p.equipped_skin AS skin, s.rating, s.wins, s.losses, s.draws,
         (SELECT count(*)::int FROM season_ratings x WHERE x.season_id = s.season_id AND x.rating > s.rating) + 1 AS rank
  FROM season_ratings s JOIN players p ON p.id = s.player_id
  WHERE s.season_id = $1`;

type BoardRow = Omit<LeaderboardEntry, 'you'> & { id: string };

/** Top `limit` of a season (ties broken by who got there first), plus the viewer's own line if they are below it. */
export async function leaderboard(db: Db, season: Season, viewerId: string | null, limit = 50): Promise<{ top: LeaderboardEntry[]; you: LeaderboardEntry | null }> {
  const rows = await db.query<BoardRow>(`${leaderboardSelect} ORDER BY s.rating DESC, s.updated_at ASC LIMIT $2`, [season.id, limit]);
  const entry = ({ id, ...r }: BoardRow): LeaderboardEntry => ({ ...r, you: id === viewerId });
  const top = rows.map(entry);
  let you = top.find((e) => e.you) ?? null;
  if (!you && viewerId) {
    const [mine] = await db.query<BoardRow>(`${leaderboardSelect} AND s.player_id = $2`, [season.id, viewerId]);
    you = mine ? entry(mine) : null;
  }
  return { top, you };
}
