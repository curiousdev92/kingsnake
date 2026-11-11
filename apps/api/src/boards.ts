import type { ScoreBoard, ScoreEntry, Season } from '@snake/meta';
import type { Db } from './db';

type Row = Omit<ScoreEntry, 'you'> & { id: string };

// Per-player totals over an optional [from, to) window. Ties share a rank.
const totals = `
  WITH totals AS (
    SELECT player_id, sum(xp)::int AS score, count(*)::int AS matches,
           (count(*) FILTER (WHERE placement = 1))::int AS wins, coalesce(sum(kills), 0)::int AS kills
    FROM match_results
    WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
      AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
    GROUP BY player_id
  )
  SELECT p.id, p.name, p.equipped_skin AS skin, t.score, t.matches, t.wins, t.kills,
         (SELECT count(*)::int FROM totals x WHERE x.score > t.score) + 1 AS rank
  FROM totals t JOIN players p ON p.id = t.player_id`;

const ORDER = 'ORDER BY t.score DESC, t.matches ASC, p.created_at ASC';

/** The best `limit` rows in board order (ties go to whoever needed fewer matches, then the older account). */
async function topRows(db: Db, month: Season | null, limit: number): Promise<Row[]> {
  return db.query<Row>(`${totals} ${ORDER} LIMIT $3`, [month?.startsAt ?? null, month?.endsAt ?? null, limit]);
}

/**
 * Top `limit` players by XP earned across all modes, in `month` (a season, i.e. one UTC
 * calendar month) or, with null, all time. Includes the viewer's own line when they are
 * below the top.
 */
export async function scoreBoard(db: Db, month: Season | null, viewerId: string | null, limit = 50): Promise<ScoreBoard> {
  const entry = ({ id, ...r }: Row): ScoreEntry => ({ ...r, you: id === viewerId });
  const top = (await topRows(db, month, limit)).map(entry);
  let you = top.find((e) => e.you) ?? null;
  if (!you && viewerId) {
    const [mine] = await db.query<Row>(`${totals} WHERE p.id = $3`, [month?.startsAt ?? null, month?.endsAt ?? null, viewerId]);
    you = mine ? entry(mine) : null;
  }
  return { kind: month ? 'monthly' : 'overall', season: month, top, you };
}

/** The month's first `count` finishers by board position (1 = first), one player each, ties already broken. */
export async function monthlyWinners(db: Db, month: Season, count: number): Promise<{ position: number; id: string; name: string; score: number }[]> {
  return (await topRows(db, month, count)).map((r, i) => ({ position: i + 1, id: r.id, name: r.name, score: r.score }));
}
