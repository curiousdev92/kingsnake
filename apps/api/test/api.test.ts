import { signPlayerToken } from '@snake/auth';
import { START_RATING, STARTING_COINS, dailyReward, getSkin, type Profile } from '@snake/meta';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createPgliteDb, migrate, type Db } from '../src/db';

const SECRET = 'test-secret';
const INTERNAL = 'test-internal';
let clock = new Date('2026-10-25T12:00:00Z');
let db: Db;
let app: FastifyInstance;

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await migrate(db); // idempotent
  app = await buildApp({ db, authSecret: SECRET, internalKey: INTERNAL, corsOrigin: true, now: () => clock });
}, 30_000);

afterAll(async () => {
  await app.close();
  await db.close();
});

async function guest(name = 'Tester'): Promise<{ token: string; profile: Profile }> {
  const res = await app.inject({ method: 'POST', url: '/auth/guest', payload: { name } });
  expect(res.statusCode).toBe(200);
  return res.json();
}

const authed = (token: string) => ({ authorization: `Bearer ${token}` });

describe('accounts', () => {
  it('creates a guest with starting coins and the free skins', async () => {
    const { token, profile } = await guest('Ann <script>');
    expect(token).toBeTruthy();
    expect(profile).toMatchObject({ name: 'Ann script', level: 1, xp: 0, coins: STARTING_COINS, equippedSkin: 'classic' });
    expect(profile.owned).toEqual(expect.arrayContaining(['classic', 'slate']));
    expect(profile.daily).toEqual({ available: true, streak: 1, reward: dailyReward(1) });
  });

  it('requires a valid token', async () => {
    expect((await app.inject({ url: '/me' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/me', headers: authed('junk') })).statusCode).toBe(401);
    const otherSecret = await signPlayerToken(crypto.randomUUID(), 'other-secret');
    expect((await app.inject({ url: '/me', headers: authed(otherSecret) })).statusCode).toBe(401);
    // Valid signature but no such player.
    const ghost = await signPlayerToken(crypto.randomUUID(), SECRET);
    expect((await app.inject({ url: '/me', headers: authed(ghost) })).statusCode).toBe(404);
  });

  it('renames, rejecting empty names', async () => {
    const { token } = await guest();
    const ok = await app.inject({ method: 'PATCH', url: '/me', headers: authed(token), payload: { name: '  Zed  ' } });
    expect(ok.json().name).toBe('Zed');
    const bad = await app.inject({ method: 'PATCH', url: '/me', headers: authed(token), payload: { name: '<<>>' } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('daily reward', () => {
  it('pays once a day and builds a streak', async () => {
    const { token } = await guest();
    const claim = () => app.inject({ method: 'POST', url: '/me/daily', headers: authed(token) });

    const day1 = await claim();
    expect(day1.json().coins).toBe(dailyReward(1));
    expect((await claim()).statusCode).toBe(409);

    clock = new Date('2026-10-26T08:00:00Z');
    const day2 = await claim();
    expect(day2.json().coins).toBe(dailyReward(2));
    expect(day2.json().profile.coins).toBe(STARTING_COINS + dailyReward(1) + dailyReward(2));

    clock = new Date('2026-10-29T08:00:00Z'); // missed days: streak resets
    expect((await claim()).json().coins).toBe(dailyReward(1));
    clock = new Date('2026-10-25T12:00:00Z');
  });
});

describe('shop', () => {
  it('lists skins', async () => {
    const res = await app.inject({ url: '/shop' });
    expect(res.json().skins.length).toBeGreaterThan(3);
  });

  it('buys with coins, refuses repeats and poverty, equips only owned skins', async () => {
    const { token } = await guest();
    const mint = getSkin('mint')!;
    const midnight = getSkin('midnight')!;
    const post = (url: string, itemId: string) => app.inject({ method: 'POST', url, headers: authed(token), payload: { itemId } });

    expect((await post('/me/equip', 'mint')).statusCode).toBe(403);
    expect((await post('/shop/buy', 'midnight')).statusCode).toBe(402);
    expect((await post('/shop/buy', 'nope')).statusCode).toBe(404);
    expect((await post('/shop/buy', 'classic')).statusCode).toBe(409);

    const bought = await post('/shop/buy', 'mint');
    expect(bought.statusCode).toBe(200);
    expect(bought.json().coins).toBe(STARTING_COINS - mint.price);
    expect(bought.json().owned).toContain('mint');
    expect((await post('/shop/buy', 'mint')).statusCode).toBe(409);

    const equipped = await post('/me/equip', 'mint');
    expect(equipped.json().equippedSkin).toBe('mint');
    expect(midnight.price).toBeGreaterThan(STARTING_COINS);
  });

  it('cannot overspend with concurrent purchases', async () => {
    const { token } = await guest();
    // Starting coins buy exactly one Mint; racing three purchases must not overspend.
    expect(getSkin('mint')!.price).toBe(STARTING_COINS);
    const results = await Promise.all(['mint', 'mint', 'ember'].map((itemId) => app.inject({ method: 'POST', url: '/shop/buy', headers: authed(token), payload: { itemId } })));
    expect(results.filter((r) => r.statusCode === 200).length).toBe(1);
    const me = (await app.inject({ url: '/me', headers: authed(token) })).json() as Profile;
    expect(me.coins).toBe(0);
    expect(me.owned).toContain('mint');
  });
});

describe('match results (internal)', () => {
  const report = (matchId: string, playerId: string) => ({
    matchId,
    totalPlayers: 8,
    results: [{ playerId, placement: 1, kills: 3, survivalMs: 120_000 }],
  });
  const send = (payload: unknown, key = INTERNAL) =>
    app.inject({ method: 'POST', url: '/internal/match-results', headers: { 'x-internal-key': key }, payload: payload as object });

  it('rejects callers without the internal key', async () => {
    const { profile } = await guest();
    expect((await send(report('m0', profile.id), 'wrong')).statusCode).toBe(401);
    expect((await app.inject({ url: `/internal/players/${profile.id}` })).statusCode).toBe(401);
  });

  it('grants rewards exactly once per match', async () => {
    const { token, profile } = await guest();
    const first = await send(report('match-1', profile.id));
    expect(first.statusCode).toBe(200);
    const grant = first.json().grants[profile.id];
    expect(grant.xp).toBeGreaterThan(0);
    expect(grant.coins).toBeGreaterThan(0);

    const replay = await send(report('match-1', profile.id));
    expect(replay.json().grants[profile.id]).toMatchObject({ xp: grant.xp, coins: grant.coins });

    const me = (await app.inject({ url: '/me', headers: authed(token) })).json() as Profile;
    expect(me.xp).toBe(grant.xp);
    expect(me.coins).toBe(STARTING_COINS + grant.coins);
  });

  it('skips unknown players and validates the report', async () => {
    const res = await send(report('match-2', crypto.randomUUID()));
    expect(res.json().grants).toEqual({});
    expect((await send({ matchId: 'x', totalPlayers: 8, results: [{ playerId: 'a', placement: 'first' }] })).statusCode).toBe(400);
    expect((await send({ matchId: '', results: [] })).statusCode).toBe(400);
  });

  it('rates ranked duels once, zero-sum, and leaves unranked matches alone', async () => {
    const a = await guest('Winner');
    const b = await guest('Loser');
    expect(a.profile.rating).toBe(START_RATING);
    const duel = (matchId: string, ranked: boolean) => ({
      matchId,
      totalPlayers: 2,
      ranked,
      results: [
        { playerId: b.profile.id, placement: 2, kills: 0, survivalMs: 30_000 },
        { playerId: a.profile.id, placement: 1, kills: 1, survivalMs: 40_000 },
      ],
    });
    const grants = (await send(duel('duel-1', true))).json().grants;
    expect(grants[a.profile.id].rating).toEqual({ before: 1000, after: 1016 });
    expect(grants[b.profile.id].rating).toEqual({ before: 1000, after: 984 });

    // A retry reports the same change and rates nothing again.
    const replay = (await send(duel('duel-1', true))).json().grants;
    expect(replay[a.profile.id].rating).toEqual({ before: 1000, after: 1016 });
    expect(((await app.inject({ url: '/me', headers: authed(a.token) })).json() as Profile).rating).toBe(1016);

    const unranked = (await send(duel('duel-2', false))).json().grants;
    expect(unranked[a.profile.id].rating).toBeUndefined();
    expect(((await app.inject({ url: '/me', headers: authed(b.token) })).json() as Profile).rating).toBe(984);
  });

  it('serves public player info to the game-server', async () => {
    const { profile } = await guest('Shown');
    const res = await app.inject({ url: `/internal/players/${profile.id}`, headers: { 'x-internal-key': INTERNAL } });
    expect(res.json()).toEqual({ id: profile.id, name: 'Shown', skin: 'classic', rating: START_RATING });
  });
});

describe('seasons and leaderboard', () => {
  const duel = (matchId: string, winner: string, loser: string) =>
    app.inject({
      method: 'POST',
      url: '/internal/match-results',
      headers: { 'x-internal-key': INTERNAL },
      payload: {
        matchId,
        totalPlayers: 2,
        ranked: true,
        results: [
          { playerId: winner, placement: 1, kills: 1, survivalMs: 40_000 },
          { playerId: loser, placement: 2, kills: 0, survivalMs: 30_000 },
        ],
      },
    });
  const me = async (token: string) => (await app.inject({ url: '/me', headers: authed(token) })).json() as Profile;

  it('ranks a season, then soft-resets and pays its reward once', async () => {
    const saved = clock;
    clock = new Date('2027-03-10T12:00:00Z'); // a season no other test touches
    const a = await guest('Ace');
    const b = await guest('Bea');
    expect((await duel('s-1', a.profile.id, b.profile.id)).statusCode).toBe(200);

    const board = (await app.inject({ url: '/leaderboard', headers: authed(b.token) })).json();
    expect(board.season.id).toBe('2027-03');
    expect(board.top.map((e: { name: string; rating: number; rank: number }) => [e.name, e.rating, e.rank])).toEqual([
      ['Ace', 1016, 1],
      ['Bea', 984, 2],
    ]);
    expect(board.you).toMatchObject({ name: 'Bea', you: true });
    expect((await me(a.token)).season).toMatchObject({ rating: 1016, wins: 1, losses: 0, rank: 1 });
    expect((await me(a.token)).seasonReward).toBeNull();

    // Next season: ratings soft-reset halfway to 1000, and last season's reward is waiting.
    clock = new Date('2027-04-02T12:00:00Z');
    const next = await me(a.token);
    expect(next.season).toMatchObject({ rating: 1008, wins: 0, rank: null });
    expect(next.seasonReward).toMatchObject({ tier: 'Bronze', coins: 60, standing: { rating: 1016, rank: 1 } });
    const claim = await app.inject({ method: 'POST', url: '/me/season-reward', headers: authed(a.token) });
    expect(claim.json().coins).toBe(60);
    expect(claim.json().profile.coins).toBe(next.coins + 60);
    expect(claim.json().profile.seasonReward).toBeNull();
    expect((await app.inject({ method: 'POST', url: '/me/season-reward', headers: authed(a.token) })).statusCode).toBe(409);

    // Old seasons stay readable; the new one is empty until someone plays.
    expect((await app.inject({ url: '/leaderboard?season=2027-03' })).json().top).toHaveLength(2);
    expect((await app.inject({ url: '/leaderboard' })).json()).toMatchObject({ top: [], you: null });
    expect((await app.inject({ url: '/leaderboard?season=bogus' })).statusCode).toBe(400);
    clock = saved;
  });
});
