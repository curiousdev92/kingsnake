/** Coins a new account starts with. */
export const STARTING_COINS = 100;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 100 + 50 * (level - 1);
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level needs in total. */
  xpForNext: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, xpIntoLevel: rest, xpForNext: xpToNext(level) };
}

export interface MatchPerformance {
  /** 1 = winner. */
  placement: number;
  totalPlayers: number;
  kills: number;
  survivalMs: number;
}

export interface Reward {
  xp: number;
  coins: number;
}

/** Longest survival that still earns XP (stops idle farming in long matches). */
const MAX_SURVIVAL_MS = 5 * 60_000;

/** XP and coins for one match. Computed by the API only; clients never claim rewards. */
export function matchReward(p: MatchPerformance): Reward {
  const total = Math.max(1, p.totalPlayers);
  const placement = Math.min(Math.max(1, p.placement), total);
  const kills = Math.max(0, Math.floor(p.kills));
  const survivalSec = Math.min(Math.max(0, p.survivalMs), MAX_SURVIVAL_MS) / 1000;
  const rank = total > 1 ? (total - placement) / (total - 1) : 0; // 1 for the winner, 0 for first out

  const xp = Math.round(10 + kills * 15 + survivalSec * 0.4 + rank * 40);
  const coins = 5 + kills * 5 + (placement === 1 ? 25 : placement <= 3 ? 10 : 0);
  return { xp, coins };
}

/** Coins for claiming the daily reward on day `streak` of a streak (capped at day 7). */
export function dailyReward(streak: number): number {
  return 20 + 10 * (Math.min(Math.max(1, streak), 7) - 1);
}

/** UTC calendar day, e.g. "2026-10-25". Daily rewards reset at 00:00 UTC. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The streak after claiming today: it continues if the last claim was yesterday,
 * otherwise it starts again at 1. Returns null if today was already claimed.
 */
export function nextStreak(lastClaimDay: string | null, streak: number, today: string): number | null {
  if (lastClaimDay === today) return null;
  const yesterday = utcDay(new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000));
  return lastClaimDay === yesterday ? streak + 1 : 1;
}
