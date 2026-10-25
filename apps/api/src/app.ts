import { timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import { signPlayerToken, verifyPlayerToken } from '@snake/auth';
import { SKINS, seasonAt, seasonById, type MatchReport } from '@snake/meta';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Db } from './db';
import { ApiError, buy, claimDaily, createGuest, equip, getProfile, publicPlayer, recordMatch, rename } from './players';
import { claimSeasonReward, leaderboard } from './seasons';

export interface AppOptions {
  db: Db;
  authSecret: string;
  internalKey: string;
  /** Allowed browser origins; `true` reflects any origin (dev only). */
  corsOrigin: true | string[];
  now?: () => Date;
  logger?: boolean;
}

const MAX_RESULTS_PER_MATCH = 16;

/**
 * The meta API: guest accounts, profiles, daily rewards, the cosmetics shop, and
 * server-to-server match reporting. Rewards are only ever granted from
 * `/internal/match-results`, which only the game-server can call.
 */
export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db, authSecret, internalKey } = opts;
  const now = opts.now ?? (() => new Date());
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 64 * 1024 });
  await app.register(cors, { origin: opts.corsOrigin, methods: ['GET', 'POST', 'PATCH'] });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.status(status).send({ error: 'bad_request', message: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Something went wrong' });
  });

  /** The authenticated player's id, from `Authorization: Bearer <token>`. */
  const playerOf = async (req: FastifyRequest): Promise<string> => {
    const header = req.headers.authorization ?? '';
    const id = header.startsWith('Bearer ') ? await verifyPlayerToken(header.slice(7), authSecret) : null;
    if (!id) throw new ApiError(401, 'unauthorized', 'Sign in again');
    return id;
  };

  const requireInternal = (req: FastifyRequest): void => {
    const given = Buffer.from(String(req.headers['x-internal-key'] ?? ''));
    const expected = Buffer.from(internalKey);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new ApiError(401, 'unauthorized', 'Internal endpoint');
  };

  const body = (req: FastifyRequest) => (req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {});

  app.get('/health', async () => ({ ok: true }));

  // ---- accounts ----

  app.post('/auth/guest', async (req) => {
    const id = await createGuest(db, body(req).name);
    return { token: await signPlayerToken(id, authSecret), profile: await getProfile(db, id, now()) };
  });

  app.get('/me', async (req) => getProfile(db, await playerOf(req), now()));

  app.patch('/me', async (req) => {
    const id = await playerOf(req);
    await rename(db, id, body(req).name);
    return getProfile(db, id, now());
  });

  app.post('/me/daily', async (req) => {
    const id = await playerOf(req);
    const coins = await claimDaily(db, id, now());
    return { coins, profile: await getProfile(db, id, now()) };
  });

  app.post('/me/season-reward', async (req) => {
    const id = await playerOf(req);
    const coins = await claimSeasonReward(db, seasonAt(now()), id);
    return { coins, profile: await getProfile(db, id, now()) };
  });

  // ---- ranked ----

  /** A season's top 50 (`?season=YYYY-MM`, default current) plus, when signed in, your own line. */
  app.get('/leaderboard', async (req) => {
    const query = req.query as { season?: string };
    const season = query.season === undefined ? seasonAt(now()) : seasonById(query.season);
    if (!season) throw new ApiError(400, 'invalid_season', 'Season ids look like 2026-10');
    const header = req.headers.authorization ?? '';
    // Signed-in viewers also get their own line; a bad token just means no line.
    const viewer = header.startsWith('Bearer ') ? await verifyPlayerToken(header.slice(7), authSecret) : null;
    return { season, ...(await leaderboard(db, season, viewer)) };
  });

  // ---- shop ----

  app.get('/shop', async () => ({ skins: SKINS }));

  app.post('/shop/buy', async (req) => {
    const id = await playerOf(req);
    await buy(db, id, body(req).itemId);
    return getProfile(db, id, now());
  });

  app.post('/me/equip', async (req) => {
    const id = await playerOf(req);
    await equip(db, id, body(req).itemId);
    return getProfile(db, id, now());
  });

  // ---- game-server only ----

  app.get('/internal/players/:id', async (req) => {
    requireInternal(req);
    const player = await publicPlayer(db, (req.params as { id: string }).id, now());
    if (!player) throw new ApiError(404, 'player_not_found', 'Player not found');
    return player;
  });

  app.post('/internal/match-results', async (req) => {
    requireInternal(req);
    return { grants: await recordMatch(db, parseReport(body(req)), now()) };
  });

  return app;
}

function parseReport(b: Record<string, unknown>): MatchReport {
  const bad = (what: string) => new ApiError(400, 'invalid_report', what);
  const int = (v: unknown, what: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(what);
    return Math.floor(v);
  };
  if (typeof b.matchId !== 'string' || b.matchId.length === 0 || b.matchId.length > 64) throw bad('matchId');
  if (!Array.isArray(b.results) || b.results.length > MAX_RESULTS_PER_MATCH) throw bad('results');
  return {
    matchId: b.matchId,
    totalPlayers: int(b.totalPlayers, 'totalPlayers'),
    ranked: b.ranked === true,
    results: b.results.map((r: Record<string, unknown>) => {
      if (typeof r?.playerId !== 'string') throw bad('playerId');
      return { playerId: r.playerId, placement: int(r.placement, 'placement'), kills: int(r.kills, 'kills'), survivalMs: int(r.survivalMs, 'survivalMs') };
    }),
  };
}
