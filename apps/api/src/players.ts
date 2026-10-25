import {
  DEFAULT_SKIN,
  FREE_SKINS,
  STARTING_COINS,
  dailyReward,
  getSkin,
  levelFromXp,
  matchReward,
  nextStreak,
  sanitizeName,
  utcDay,
  type Grant,
  type MatchReport,
  type Profile,
} from '@snake/meta';
import type { Db } from './db';

/** An expected failure with an HTTP status and a stable code for clients. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface PlayerRow {
  id: string;
  name: string;
  xp: number;
  coins: number;
  equipped_skin: string;
  // Selected as text: driver Date parsing of `date` columns is timezone-dependent.
  daily_last_claim: string | null;
  daily_streak: number;
}

const PLAYER_COLUMNS = 'id, name, xp, coins, equipped_skin, daily_last_claim::text AS daily_last_claim, daily_streak';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadRow(db: Db, id: string, lock = false): Promise<PlayerRow | null> {
  if (!UUID.test(id)) return null;
  const rows = await db.query<PlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM players WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function requireRow(db: Db, id: string, lock = false): Promise<PlayerRow> {
  const row = await loadRow(db, id, lock);
  if (!row) throw new ApiError(404, 'player_not_found', 'Player not found');
  return row;
}

async function ownedItems(db: Db, id: string): Promise<string[]> {
  const rows = await db.query<{ item_id: string }>('SELECT item_id FROM owned_items WHERE player_id = $1 ORDER BY acquired_at', [id]);
  return [...FREE_SKINS, ...rows.map((r) => r.item_id).filter((i) => !FREE_SKINS.includes(i))];
}

function toProfile(row: PlayerRow, owned: string[], now: Date): Profile {
  const next = nextStreak(row.daily_last_claim, row.daily_streak, utcDay(now));
  return {
    id: row.id,
    name: row.name,
    xp: row.xp,
    ...levelFromXp(row.xp),
    coins: row.coins,
    equippedSkin: row.equipped_skin,
    owned,
    daily: {
      available: next !== null,
      streak: next ?? row.daily_streak,
      reward: dailyReward(next ?? row.daily_streak),
    },
  };
}

export async function getProfile(db: Db, id: string, now: Date): Promise<Profile> {
  const row = await requireRow(db, id);
  return toProfile(row, await ownedItems(db, id), now);
}

export async function createGuest(db: Db, name: unknown): Promise<string> {
  const id = crypto.randomUUID();
  const clean = sanitizeName(name) || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
  await db.query('INSERT INTO players (id, name, coins, equipped_skin) VALUES ($1, $2, $3, $4)', [id, clean, STARTING_COINS, DEFAULT_SKIN]);
  return id;
}

export async function rename(db: Db, id: string, name: unknown): Promise<void> {
  const clean = sanitizeName(name);
  if (!clean) throw new ApiError(400, 'invalid_name', 'Name must contain letters or digits');
  await requireRow(db, id);
  await db.query('UPDATE players SET name = $2 WHERE id = $1', [id, clean]);
}

export async function claimDaily(db: Db, id: string, now: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const row = await requireRow(tx, id, true);
    const today = utcDay(now);
    const streak = nextStreak(row.daily_last_claim, row.daily_streak, today);
    if (streak === null) throw new ApiError(409, 'already_claimed', 'Daily reward already claimed today');
    const coins = dailyReward(streak);
    await tx.query('UPDATE players SET coins = coins + $2, daily_last_claim = $3, daily_streak = $4 WHERE id = $1', [id, coins, today, streak]);
    return coins;
  });
}

export async function buy(db: Db, id: string, itemId: unknown): Promise<void> {
  const skin = typeof itemId === 'string' ? getSkin(itemId) : undefined;
  if (!skin) throw new ApiError(404, 'item_not_found', 'No such item');
  if (skin.price === 0) throw new ApiError(409, 'already_owned', 'Already owned');
  await db.transaction(async (tx) => {
    const row = await requireRow(tx, id, true);
    const owned = await tx.query('SELECT 1 FROM owned_items WHERE player_id = $1 AND item_id = $2', [id, skin.id]);
    if (owned.length > 0) throw new ApiError(409, 'already_owned', 'Already owned');
    if (row.coins < skin.price) throw new ApiError(402, 'not_enough_coins', 'Not enough coins');
    await tx.query('UPDATE players SET coins = coins - $2 WHERE id = $1', [id, skin.price]);
    await tx.query('INSERT INTO owned_items (player_id, item_id) VALUES ($1, $2)', [id, skin.id]);
  });
}

export async function equip(db: Db, id: string, itemId: unknown): Promise<void> {
  const skin = typeof itemId === 'string' ? getSkin(itemId) : undefined;
  if (!skin) throw new ApiError(404, 'item_not_found', 'No such item');
  if (!(await ownedItems(db, id)).includes(skin.id)) throw new ApiError(403, 'not_owned', 'Buy it first');
  await db.query('UPDATE players SET equipped_skin = $2 WHERE id = $1', [id, skin.id]);
}

/** Name and equipped skin, for the game-server to show in matches. */
export async function publicPlayer(db: Db, id: string): Promise<{ id: string; name: string; skin: string } | null> {
  const row = await loadRow(db, id);
  return row && { id: row.id, name: row.name, skin: row.equipped_skin };
}

/**
 * Grants match rewards. Idempotent per (matchId, playerId): a retried report
 * returns the original grants and never pays twice. Unknown players are skipped.
 */
export async function recordMatch(db: Db, report: MatchReport): Promise<Record<string, Grant>> {
  const grants: Record<string, Grant> = {};
  for (const r of report.results) {
    await db.transaction(async (tx) => {
      const row = await loadRow(tx, r.playerId, true);
      if (!row) return;
      const reward = matchReward({ placement: r.placement, totalPlayers: report.totalPlayers, kills: r.kills, survivalMs: r.survivalMs });
      const inserted = await tx.query<{ xp: number; coins: number }>(
        `INSERT INTO match_results (match_id, player_id, placement, total_players, kills, survival_ms, xp, coins)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING RETURNING xp, coins`,
        [report.matchId, r.playerId, r.placement, report.totalPlayers, Math.max(0, Math.floor(r.kills)), Math.max(0, Math.floor(r.survivalMs)), reward.xp, reward.coins],
      );
      if (inserted.length === 0) {
        // Already recorded: report the original grant again.
        const [prior] = await tx.query<{ xp: number; coins: number }>('SELECT xp, coins FROM match_results WHERE match_id = $1 AND player_id = $2', [report.matchId, r.playerId]);
        const level = levelFromXp(row.xp).level;
        grants[r.playerId] = { xp: prior!.xp, coins: prior!.coins, levelBefore: level, levelAfter: level };
        return;
      }
      await tx.query('UPDATE players SET xp = xp + $2, coins = coins + $3 WHERE id = $1', [r.playerId, reward.xp, reward.coins]);
      grants[r.playerId] = {
        ...reward,
        levelBefore: levelFromXp(row.xp).level,
        levelAfter: levelFromXp(row.xp + reward.xp).level,
      };
    });
  }
  return grants;
}
