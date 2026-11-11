import { MAX_PAYOUT_DETAILS, MONTHLY_PRIZES, monthlyPrizeFor, previousSeason, type MonthlyPrize, type PrizeStatus, type Season } from '@snake/meta';
import { monthlyWinners } from './boards';
import type { Db } from './db';
import { ApiError } from './errors';

interface ClaimRow {
  player_id: string;
  rank: number;
  amount_usd: number;
  payout_details: string;
  status: 'requested' | 'paid';
}

const winnersOf = (db: Db, month: Season) => monthlyWinners(db, month, MONTHLY_PRIZES.length);

/** Last month's cash prize for this player, if they finished in the top three. */
export async function pendingMonthlyPrize(db: Db, current: Season, playerId: string): Promise<MonthlyPrize | null> {
  const month = previousSeason(current);
  const win = (await winnersOf(db, month)).find((w) => w.id === playerId);
  if (!win) return null;
  const [claim] = await db.query<{ status: 'requested' | 'paid' }>('SELECT status FROM monthly_prizes WHERE month_id = $1 AND player_id = $2', [month.id, playerId]);
  const status: PrizeStatus = claim?.status ?? 'unclaimed';
  return { month, rank: win.position, amountUsd: monthlyPrizeFor(win.position)!, status };
}

/**
 * Records a winner's payout details (once). Only registered accounts can claim, so a
 * prize always has an account with an email behind it. The game never moves money.
 */
export async function claimMonthlyPrize(db: Db, current: Season, playerId: string, details: unknown): Promise<void> {
  const text = typeof details === 'string' ? details.trim() : '';
  if (text.length < 3 || text.length > MAX_PAYOUT_DETAILS) {
    throw new ApiError(400, 'invalid_details', `Enter how to pay you (3 to ${MAX_PAYOUT_DETAILS} characters)`);
  }
  const [account] = await db.query<{ email: string | null }>('SELECT email FROM players WHERE id = $1', [playerId]);
  if (!account) throw new ApiError(404, 'player_not_found', 'Player not found');
  const prize = await pendingMonthlyPrize(db, current, playerId);
  if (!prize) throw new ApiError(409, 'nothing_to_claim', 'No prize to claim');
  if (!account.email) throw new ApiError(403, 'register_required', 'Sign up with an email to claim a cash prize');
  const inserted = await db.query(
    `INSERT INTO monthly_prizes (month_id, player_id, rank, amount_usd, payout_details)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING player_id`,
    [prize.month.id, playerId, prize.rank, prize.amountUsd, text],
  );
  if (inserted.length === 0) throw new ApiError(409, 'already_claimed', 'Prize already claimed');
}

export interface PayoutLine {
  month: string;
  rank: number;
  amountUsd: number;
  playerId: string;
  name: string;
  email: string | null;
  status: PrizeStatus;
  payoutDetails: string | null;
}

/** Everything the owner needs to pay a month's winners, claimed or not. */
export async function payoutList(db: Db, month: Season): Promise<PayoutLine[]> {
  const winners = await winnersOf(db, month);
  const claims = await db.query<ClaimRow>('SELECT player_id, rank, amount_usd, payout_details, status FROM monthly_prizes WHERE month_id = $1', [month.id]);
  const emails = await db.query<{ id: string; email: string | null }>('SELECT id, email FROM players WHERE id = ANY($1::uuid[])', [winners.map((w) => w.id)]);
  return winners.map((w) => {
    const claim = claims.find((c) => c.player_id === w.id);
    return {
      month: month.id,
      rank: w.position,
      amountUsd: monthlyPrizeFor(w.position)!,
      playerId: w.id,
      name: w.name,
      email: emails.find((e) => e.id === w.id)?.email ?? null,
      status: claim?.status ?? 'unclaimed',
      payoutDetails: claim?.payout_details ?? null,
    };
  });
}

/** Marks a requested prize as paid (after the owner paid it by hand). */
export async function markPrizePaid(db: Db, month: Season, playerId: string): Promise<void> {
  const updated = await db.query(
    `UPDATE monthly_prizes SET status = 'paid', paid_at = now() WHERE month_id = $1 AND player_id = $2 AND status = 'requested' RETURNING player_id`,
    [month.id, playerId],
  );
  if (updated.length === 0) throw new ApiError(404, 'no_requested_prize', 'No requested prize for that player and month');
}
