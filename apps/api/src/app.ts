import { timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import { signPlayerToken, verifyPlayerToken } from '@snake/auth';
import { SKINS, previousSeason, seasonAt, seasonById, type MatchReport } from '@snake/meta';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Db } from './db';
import { ApiError, buy, claimDaily, createGuest, equip, getProfile, login, publicPlayer, recordMatch, register, rename, setAvatar } from './players';
import { scoreBoard } from './boards';
import { claimMonthlyPrize, markPrizePaid, payoutList } from './prizes';
import { claimSeasonReward, leaderboard } from './seasons';
import { allowRequest } from './redis';

export interface AppOptions {
  db: Db;
  authSecret: string;
  internalKey: string;
  /** Allowed browser origins; `true` reflects any origin (dev only). */
  corsOrigin: true | string[];
  now?: () => Date;
  logger?: boolean;
}

// Above the biggest room (20 snakes), so no full match is ever refused.
const MAX_RESULTS_PER_MATCH = 32;

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

  /** Like `playerOf`, but a missing or bad token means "nobody" instead of 401. */
  const optionalPlayerOf = async (req: FastifyRequest): Promise<string | null> => {
    const header = req.headers.authorization ?? '';
    return header.startsWith('Bearer ') ? verifyPlayerToken(header.slice(7), authSecret) : null;
  };

  const rateLimited = { error: 'rate_limited', message: 'Too many attempts, try again in a minute' };

  const requireInternal = (req: FastifyRequest): void => {
    const given = Buffer.from(String(req.headers['x-internal-key'] ?? ''));
    const expected = Buffer.from(internalKey);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new ApiError(401, 'unauthorized', 'Internal endpoint');
  };

  const body = (req: FastifyRequest) => (req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {});

  app.get('/', async () => ({ name: 'snake-arena-api', ok: true, health: '/health' }));
  app.get('/health', async () => ({ ok: true }));

  // ---- accounts ----

  app.post('/auth/guest', async (req, reply) => {
    const address = req.ip;
    if (!(await allowRequest(`guest:${address}`))) {
      return reply.status(429).send({ error: 'rate_limited', message: 'Too many guest accounts requested' });
    }
    const id = await createGuest(db, body(req).name);
    return { token: await signPlayerToken(id, authSecret), profile: await getProfile(db, id, now()) };
  });

  /** Email + password sign-up. A signed-in guest's progress moves to the new login. */
  app.post('/auth/register', async (req, reply) => {
    if (!(await allowRequest(`register:${req.ip}`))) return reply.status(429).send(rateLimited);
    const b = body(req);
    const id = await register(db, await optionalPlayerOf(req), b.email, b.password, b.name);
    return { token: await signPlayerToken(id, authSecret), profile: await getProfile(db, id, now()) };
  });

  app.post('/auth/login', async (req, reply) => {
    if (!(await allowRequest(`login:${req.ip}`))) return reply.status(429).send(rateLimited);
    const id = await login(db, body(req).email, body(req).password);
    return { token: await signPlayerToken(id, authSecret), profile: await getProfile(db, id, now()) };
  });

  app.get('/me', async (req) => getProfile(db, await playerOf(req), now()));

  /** Changes `name` and/or `avatar`. */
  app.patch('/me', async (req) => {
    const id = await playerOf(req);
    const b = body(req);
    if ('avatar' in b) await setAvatar(db, id, b.avatar);
    if ('name' in b || !('avatar' in b)) await rename(db, id, b.name);
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

  /** Last month's top three claim a cash prize by leaving payout details (the owner pays by hand). */
  app.post('/me/monthly-prize', async (req) => {
    const id = await playerOf(req);
    await claimMonthlyPrize(db, seasonAt(now()), id, body(req).details);
    return getProfile(db, id, now());
  });

  // ---- ranked ----

  /** A season's top 50 (`?season=YYYY-MM`, default current) plus, when signed in, your own line. */
  app.get('/leaderboard', async (req) => {
    const query = req.query as { season?: string };
    const season = query.season === undefined ? seasonAt(now()) : seasonById(query.season);
    if (!season) throw new ApiError(400, 'invalid_season', 'Season ids look like 2026-10');
    // Signed-in viewers also get their own line; a bad token just means no line.
    const viewer = await optionalPlayerOf(req);
    return { season, ...(await leaderboard(db, season, viewer)) };
  });

  /** Everyone, every mode, all time: ranked by XP earned. */
  app.get('/leaderboard/overall', async (req) => scoreBoard(db, null, await optionalPlayerOf(req)));

  /** Like overall, for one month (`?month=YYYY-MM`, default the current one). */
  app.get('/leaderboard/monthly', async (req) => {
    const query = req.query as { month?: string };
    const month = query.month === undefined ? seasonAt(now()) : seasonById(query.month);
    if (!month) throw new ApiError(400, 'invalid_month', 'Month ids look like 2026-10');
    return scoreBoard(db, month, await optionalPlayerOf(req));
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

  /** Who won a month's cash prizes, with payout details once claimed (`?month=YYYY-MM`, default last month). */
  app.get('/internal/monthly-prizes', async (req) => {
    requireInternal(req);
    const q = req.query as { month?: string };
    const month = q.month === undefined ? previousSeason(seasonAt(now())) : seasonById(q.month);
    if (!month) throw new ApiError(400, 'invalid_month', 'Month ids look like 2026-10');
    return { month, prizes: await payoutList(db, month) };
  });

  /** After paying a winner by hand: `{ month, playerId }`. */
  app.post('/internal/monthly-prizes/paid', async (req) => {
    requireInternal(req);
    const b = body(req);
    const month = seasonById(b.month);
    if (!month || typeof b.playerId !== 'string') throw new ApiError(400, 'bad_request', 'Send { month: "YYYY-MM", playerId }');
    await markPrizePaid(db, month, b.playerId);
    return { ok: true };
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
