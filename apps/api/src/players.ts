import {
  DEFAULT_SKIN,
  FREE_SKINS,
  STARTING_COINS,
  dailyReward,
  getAvatar,
  getSkin,
  levelFromXp,
  matchReward,
  nextStreak,
  normalizeEmail,
  passwordProblem,
  sanitizeName,
  applyRating,
  ratingDelta,
  seasonAt,
  utcDay,
  type Grant,
  type MatchResultEntry,
  type MatchReport,
  type PlayerStats,
  type Profile,
} from '@snake/meta';
import type { Db } from './db';
import { ApiError } from './errors';
import { hashPassword, verifyPassword } from './passwords';
import { pendingMonthlyPrize } from './prizes';
import { lockSeasonRating, pendingSeasonReward, recordSeasonResult, seasonRating, standing } from './seasons';

export { ApiError };

interface PlayerRow {
  id: string;
  name: string;
  email: string | null;
  avatar: string;
  xp: number;
  coins: number;
  equipped_skin: string;
  // Selected as text: driver Date parsing of `date` columns is timezone-dependent.
  daily_last_claim: string | null;
  daily_streak: number;
}

const PLAYER_COLUMNS = 'id, name, email, avatar, xp, coins, equipped_skin, daily_last_claim::text AS daily_last_claim, daily_streak';
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

async function playerStats(db: Db, id: string): Promise<PlayerStats> {
  const [row] = await db.query<{ matches: number; wins: number; kills: number; best: number | null; survival: number }>(
    `SELECT count(*)::int AS matches, (count(*) FILTER (WHERE placement = 1))::int AS wins, coalesce(sum(kills), 0)::int AS kills,
       min(placement) AS best, coalesce(sum(survival_ms), 0)::float8 AS survival
     FROM match_results WHERE player_id = $1`,
    [id],
  );
  return { matches: row?.matches ?? 0, wins: row?.wins ?? 0, kills: row?.kills ?? 0, bestPlacement: row?.best ?? null, survivalMs: row?.survival ?? 0 };
}

function toProfile(row: PlayerRow, owned: string[], stats: PlayerStats, now: Date, ranked: Pick<Profile, 'season' | 'seasonReward' | 'monthlyPrize'>): Profile {
  const next = nextStreak(row.daily_last_claim, row.daily_streak, utcDay(now));
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar,
    stats,
    xp: row.xp,
    ...levelFromXp(row.xp),
    coins: row.coins,
    rating: ranked.season.rating,
    ...ranked,
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
  const season = seasonAt(now);
  return toProfile(row, await ownedItems(db, id), await playerStats(db, id), now, {
    season: await standing(db, season, id),
    seasonReward: await pendingSeasonReward(db, season, id),
    monthlyPrize: await pendingMonthlyPrize(db, season, id),
  });
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

export async function setAvatar(db: Db, id: string, avatar: unknown): Promise<void> {
  const found = typeof avatar === 'string' ? getAvatar(avatar) : undefined;
  if (!found) throw new ApiError(400, 'invalid_avatar', 'No such avatar');
  await requireRow(db, id);
  await db.query('UPDATE players SET avatar = $2 WHERE id = $1', [id, found.id]);
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === '23505';

/**
 * Registers an email and password. A signed-in guest keeps their progress: the
 * credentials are attached to that account. Without a guest (or when the current
 * account is already registered) a new account is created.
 */
export async function register(db: Db, guestId: string | null, email: unknown, password: unknown, name: unknown): Promise<string> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) throw new ApiError(400, 'invalid_email', 'Enter a valid email address');
  const problem = passwordProblem(password);
  if (problem) throw new ApiError(400, 'invalid_password', problem);
  const taken = () => new ApiError(409, 'email_taken', 'An account with this email already exists');
  if ((await db.query('SELECT 1 FROM players WHERE email = $1', [cleanEmail])).length > 0) throw taken();
  const hash = await hashPassword(password as string);
  try {
    const guest = guestId ? await loadRow(db, guestId) : null;
    if (guest && guest.email === null) {
      const updated = await db.query('UPDATE players SET email = $2, password_hash = $3 WHERE id = $1 AND email IS NULL RETURNING id', [guest.id, cleanEmail, hash]);
      if (updated.length > 0) return guest.id;
    }
    const id = await createGuest(db, name);
    await db.query('UPDATE players SET email = $2, password_hash = $3 WHERE id = $1', [id, cleanEmail, hash]);
    return id;
  } catch (e) {
    if (isUniqueViolation(e)) throw taken();
    throw e;
  }
}

// Checked against when the email is unknown, so a miss takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

/** The account id for these credentials; the same error for an unknown email and a wrong password. */
export async function login(db: Db, email: unknown, password: unknown): Promise<string> {
  const wrong = new ApiError(401, 'invalid_credentials', 'Wrong email or password');
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || typeof password !== 'string' || passwordProblem(password)) throw wrong;
  const [row] = await db.query<{ id: string; password_hash: string | null }>('SELECT id, password_hash FROM players WHERE email = $1', [cleanEmail]);
  if (!row?.password_hash) {
    await verifyPassword(password, await (dummyHash ??= hashPassword('not-a-real-password')));
    throw wrong;
  }
  if (!(await verifyPassword(password, row.password_hash))) throw wrong;
  return row.id;
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
  if (skin.exclusive) throw new ApiError(403, 'not_for_sale', `${skin.name} is a reward and cannot be bought`);
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

/** Name, equipped skin and this season's duel rating, for the game-server (matches and the ranked queue). */
export async function publicPlayer(db: Db, id: string, now: Date): Promise<{ id: string; name: string; skin: string; rating: number } | null> {
  const row = await loadRow(db, id);
  return row && { id: row.id, name: row.name, skin: row.equipped_skin, rating: await seasonRating(db, seasonAt(now), id) };
}

/**
 * Grants match rewards, and for ranked duels updates both ratings. Idempotent per
 * (matchId, playerId): a retried report returns the original grants and never pays
 * or rates twice. Unknown players are skipped (and leave a duel unranked).
 */
export async function recordMatch(db: Db, report: MatchReport, now: Date): Promise<Record<string, Grant>> {
  const grants: Record<string, Grant> = {};
  const [a, b] = report.results;
  if (report.ranked && report.totalPlayers === 2 && a && b && report.results.length === 2 && a.playerId !== b.playerId) {
    const rated = await db.transaction(async (tx) => {
      // Lock both rows in a fixed order so concurrent reports can't deadlock.
      const [first, second] = [a.playerId, b.playerId].sort();
      const rowFirst = await loadRow(tx, first!, true);
      const rowSecond = await loadRow(tx, second!, true);
      if (!rowFirst || !rowSecond) return false;
      const [rowA, rowB] = rowFirst.id === a.playerId ? [rowFirst, rowSecond] : [rowSecond, rowFirst];
      // Ratings belong to the season the match ended in.
      const season = seasonAt(now);
      const ratingFirst = await lockSeasonRating(tx, season, first!);
      const ratingSecond = await lockSeasonRating(tx, season, second!);
      const [ratingA, ratingB] = first === a.playerId ? [ratingFirst, ratingSecond] : [ratingSecond, ratingFirst];
      // Lower placement wins; equal placements (both died on the same tick) draw.
      const scoreA = a.placement < b.placement ? 1 : a.placement > b.placement ? 0 : 0.5;
      const deltaA = ratingDelta(ratingA, ratingB, scoreA);
      grants[a.playerId] = await recordResult(tx, report, a, rowA, { season, rating: ratingA, delta: deltaA, score: scoreA }, now);
      grants[b.playerId] = await recordResult(tx, report, b, rowB, { season, rating: ratingB, delta: -deltaA, score: 1 - scoreA }, now);
      return true;
    });
    if (rated) return grants;
  }
  for (const r of report.results) {
    await db.transaction(async (tx) => {
      const row = await loadRow(tx, r.playerId, true);
      if (row) grants[r.playerId] = await recordResult(tx, report, r, row, null, now);
    });
  }
  return grants;
}

interface RankedResult {
  season: ReturnType<typeof seasonAt>;
  /** Season rating before the match (row locked by lockSeasonRating). */
  rating: number;
  delta: number;
  score: number;
}

/** One player's result inside a transaction holding their row locks. */
async function recordResult(tx: Db, report: MatchReport, r: MatchResultEntry, row: PlayerRow, ranked: RankedResult | null, now: Date): Promise<Grant> {
  const reward = matchReward({ placement: r.placement, totalPlayers: report.totalPlayers, kills: r.kills, survivalMs: r.survivalMs });
  const after = ranked && applyRating(ranked.rating, ranked.delta);
  const inserted = await tx.query<{ xp: number }>(
    `INSERT INTO match_results (match_id, player_id, placement, total_players, kills, survival_ms, xp, coins, rating_delta, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz) ON CONFLICT DO NOTHING RETURNING xp`,
    [report.matchId, r.playerId, r.placement, report.totalPlayers, Math.max(0, Math.floor(r.kills)), Math.max(0, Math.floor(r.survivalMs)), reward.xp, reward.coins, ranked ? after! - ranked.rating : null, now.toISOString()],
  );
  const level = levelFromXp(row.xp).level;
  if (inserted.length === 0) {
    // Already recorded: report the original grant again.
    const [prior] = await tx.query<{ xp: number; coins: number; rating_delta: number | null }>(
      'SELECT xp, coins, rating_delta FROM match_results WHERE match_id = $1 AND player_id = $2',
      [report.matchId, r.playerId],
    );
    const grant: Grant = { xp: prior!.xp, coins: prior!.coins, levelBefore: level, levelAfter: level };
    if (prior!.rating_delta !== null && ranked) grant.rating = { before: ranked.rating - prior!.rating_delta, after: ranked.rating };
    return grant;
  }
  await tx.query('UPDATE players SET xp = xp + $2, coins = coins + $3 WHERE id = $1', [r.playerId, reward.xp, reward.coins]);
  const grant: Grant = { ...reward, levelBefore: level, levelAfter: levelFromXp(row.xp + reward.xp).level };
  if (ranked) {
    await recordSeasonResult(tx, ranked.season, r.playerId, after!, ranked.score);
    grant.rating = { before: ranked.rating, after: after! };
  }
  return grant;
}
