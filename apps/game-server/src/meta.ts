import { internalKey } from '@snake/auth';
import type { Grant, MatchReport } from '@snake/meta';

/** What the game-server needs from the meta API. Swappable for tests. */
export interface MetaService {
  /** Display name and equipped skin of an account, or null if unknown/unreachable. */
  lookupPlayer(playerId: string): Promise<{ name: string; skin: string } | null>;
  /** Reports a finished match; returns what each account was granted. */
  reportMatch(report: MatchReport): Promise<Record<string, Grant>>;
}

const TIMEOUT_MS = 3000;

/** Calls the API's `/internal/*` endpoints with the shared internal key. */
export class HttpMetaService implements MetaService {
  constructor(
    private readonly baseUrl = process.env.API_URL ?? 'http://localhost:3000',
    private readonly key = internalKey(),
  ) {}

  async lookupPlayer(playerId: string) {
    try {
      const res = await fetch(`${this.baseUrl}/internal/players/${encodeURIComponent(playerId)}`, {
        headers: { 'x-internal-key': this.key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { name: string; skin: string };
      return { name: body.name, skin: body.skin };
    } catch {
      return null; // API down: the player still plays, with their typed name and no skin
    }
  }

  async reportMatch(report: MatchReport) {
    // Retried on failure; the API grants at most once per (matchId, playerId).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/internal/match-results`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-internal-key': this.key },
          body: JSON.stringify(report),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) return ((await res.json()) as { grants: Record<string, Grant> }).grants;
        if (res.status < 500) break; // our bug; retrying won't help
      } catch {
        // network error: retry
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
    console.error(`match ${report.matchId}: could not report results to the API`);
    return {};
  }
}

/** For tests and offline dev: no accounts, no rewards. */
export const offlineMeta: MetaService = {
  lookupPlayer: async () => null,
  reportMatch: async () => ({}),
};
