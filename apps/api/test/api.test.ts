import { signPlayerToken } from '@snake/auth';
import { FREE_SKINS, START_RATING, STARTING_COINS, dailyReward, getSkin, matchReward, type Profile } from '@snake/meta';
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

describe('email login', () => {
  const post = (url: string, payload: object, token?: string) =>
    app.inject({ method: 'POST', url, payload, ...(token && { headers: authed(token) }) });

  it('registers a guest in place, keeping progress, then logs in', async () => {
    const { token, profile } = await guest('Reggie');
    expect(profile).toMatchObject({ email: null, avatar: 'snake' });
    await app.inject({ method: 'POST', url: '/me/daily', headers: authed(token) });

    const reg = await post('/auth/register', { email: ' Reggie@Example.com ', password: 'hunter2hunter2' }, token);
    expect(reg.statusCode).toBe(200);
    expect(reg.json().profile).toMatchObject({ id: profile.id, email: 'reggie@example.com', coins: STARTING_COINS + dailyReward(1) });

    const ok = await post('/auth/login', { email: 'REGGIE@example.com', password: 'hunter2hunter2' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().profile.id).toBe(profile.id);
    expect((await app.inject({ url: '/me', headers: authed(ok.json().token) })).json().name).toBe('Reggie');
  });

  it('rejects wrong passwords, unknown emails, duplicates and weak input', async () => {
    await post('/auth/register', { email: 'dup@example.com', password: 'longenough' });
    const wrong = await post('/auth/login', { email: 'dup@example.com', password: 'wrongpassword' });
    const unknown = await post('/auth/login', { email: 'nobody@example.com', password: 'wrongpassword' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error).toBe(wrong.json().error);
    expect((await post('/auth/register', { email: 'DUP@example.com', password: 'longenough' })).statusCode).toBe(409);
    expect((await post('/auth/register', { email: 'not-an-email', password: 'longenough' })).statusCode).toBe(400);
    expect((await post('/auth/register', { email: 'short@example.com', password: 'short' })).statusCode).toBe(400);
  });

  it('creates a separate account when the signed-in one is already registered', async () => {
    const first = (await post('/auth/register', { email: 'one@example.com', password: 'longenough' })).json();
    const second = (await post('/auth/register', { email: 'two@example.com', password: 'longenough' }, first.token)).json();
    expect(second.profile.id).not.toBe(first.profile.id);
    expect((await app.inject({ url: '/me', headers: authed(first.token) })).json().email).toBe('one@example.com');
  });
});

describe('profile', () => {
  it('changes the avatar, rejecting unknown ones', async () => {
    const { token } = await guest('Ava');
    const ok = await app.inject({ method: 'PATCH', url: '/me', headers: authed(token), payload: { avatar: 'crown' } });
    expect(ok.json()).toMatchObject({ avatar: 'crown', name: 'Ava' });
    const bad = await app.inject({ method: 'PATCH', url: '/me', headers: authed(token), payload: { avatar: 'nope' } });
    expect(bad.statusCode).toBe(400);
  });

  it('totals match stats', async () => {
    const { token, profile } = await guest('Stats');
    expect(profile.stats).toEqual({ matches: 0, wins: 0, kills: 0, bestPlacement: null, survivalMs: 0 });
    const report = (matchId: string, placement: number, kills: number) =>
      app.inject({
        method: 'POST',
        url: '/internal/match-results',
        headers: { 'x-internal-key': INTERNAL },
        payload: { matchId, totalPlayers: 8, results: [{ playerId: profile.id, placement, kills, survivalMs: 30_000 }] },
      });
    await report('stats-1', 3, 2);
    await report('stats-2', 1, 4);
    await report('stats-2', 1, 4); // retried report counts once
    const me = (await app.inject({ url: '/me', headers: authed(token) })).json() as Profile;
    expect(me.stats).toEqual({ matches: 2, wins: 1, kills: 6, bestPlacement: 1, survivalMs: 60_000 });
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

describe('score boards', () => {
  const report = (matchId: string, playerId: string, placement: number, kills: number) =>
    app.inject({
      method: 'POST',
      url: '/internal/match-results',
      headers: { 'x-internal-key': INTERNAL },
      payload: { matchId, totalPlayers: 8, results: [{ playerId, placement, kills, survivalMs: 30_000 }] },
    });
  const xp = (placement: number, kills: number) => matchReward({ placement, totalPlayers: 8, kills, survivalMs: 30_000 }).xp;

  it('adds up XP across all matches for all time, and per month', async () => {
    const saved = clock;
    clock = new Date('2028-05-10T12:00:00Z'); // months no other test touches
    const a = await guest('Boardy A');
    const b = await guest('Boardy B');
    const idle = await guest('Boardy Idle');
    await report('b-may-1', a.profile.id, 1, 3);
    await report('b-may-2', b.profile.id, 5, 0);
    clock = new Date('2028-06-02T12:00:00Z');
    await report('b-jun-1', b.profile.id, 1, 5);

    // May: A beat B.
    const may = (await app.inject({ url: '/leaderboard/monthly?month=2028-05', headers: authed(b.token) })).json();
    expect(may.season.id).toBe('2028-05');
    expect(may.top.map((e: { name: string; score: number; rank: number }) => [e.name, e.score, e.rank])).toEqual([
      ['Boardy A', xp(1, 3), 1],
      ['Boardy B', xp(5, 0), 2],
    ]);
    expect(may.you).toMatchObject({ name: 'Boardy B', you: true, rank: 2, matches: 1 });

    // June (the current month): only B played.
    const june = (await app.inject({ url: '/leaderboard/monthly', headers: authed(a.token) })).json();
    expect(june.top.map((e: { name: string }) => e.name)).toEqual(['Boardy B']);
    expect(june.top[0]).toMatchObject({ score: xp(1, 5), wins: 1, kills: 5 });
    expect(june.you).toBeNull(); // A has no June matches

    // All time spans both months and every player.
    const all = (await app.inject({ url: '/leaderboard/overall', headers: authed(a.token) })).json();
    expect(all).toMatchObject({ kind: 'overall', season: null });
    const rowOf = (name: string) => all.top.find((e: { name: string }) => e.name === name);
    expect(rowOf('Boardy B')).toMatchObject({ score: xp(5, 0) + xp(1, 5), matches: 2, wins: 1, kills: 5 });
    expect(rowOf('Boardy A')).toMatchObject({ score: xp(1, 3), you: true });
    expect(rowOf('Boardy Idle')).toBeUndefined(); // no matches, no line
    expect(all.top.findIndex((e: { name: string }) => e.name === 'Boardy B')).toBeLessThan(
      all.top.findIndex((e: { name: string }) => e.name === 'Boardy A'),
    );

    expect((await app.inject({ url: '/leaderboard/monthly?month=bogus' })).statusCode).toBe(400);
    void idle;
    clock = saved;
  });
});

describe('monthly cash prizes', () => {
  const internal = { 'x-internal-key': INTERNAL };
  const report = (matchId: string, playerId: string, placement: number, kills: number) =>
    app.inject({
      method: 'POST',
      url: '/internal/match-results',
      headers: internal,
      payload: { matchId, totalPlayers: 8, results: [{ playerId, placement, kills, survivalMs: 30_000 }] },
    });
  const me = async (token: string) => (await app.inject({ url: '/me', headers: authed(token) })).json() as Profile;
  const claim = (token: string, details: unknown) =>
    app.inject({ method: 'POST', url: '/me/monthly-prize', headers: authed(token), payload: { details } });

  it('pays the top three of a finished month, once, by hand', async () => {
    const saved = clock;
    clock = new Date('2030-05-10T12:00:00Z');
    const [a, b, c, d] = [await guest('Prize A'), await guest('Prize B'), await guest('Prize C'), await guest('Prize D')];
    await report('p-1', a.profile.id, 1, 3);
    await report('p-2', b.profile.id, 2, 1);
    await report('p-3', c.profile.id, 5, 0);
    await report('p-4', d.profile.id, 8, 0);

    // During the month nothing is claimable yet.
    expect((await me(a.token)).monthlyPrize).toBeNull();

    clock = new Date('2030-06-02T12:00:00Z');
    expect((await me(a.token)).monthlyPrize).toMatchObject({ rank: 1, amountUsd: 50, status: 'unclaimed', month: { id: '2030-05' } });
    expect((await me(b.token)).monthlyPrize).toMatchObject({ rank: 2, amountUsd: 25 });
    expect((await me(c.token)).monthlyPrize).toMatchObject({ rank: 3, amountUsd: 10 });
    expect((await me(d.token)).monthlyPrize).toBeNull(); // 4th: no prize
    expect((await claim(d.token, 'me@pay.example')).statusCode).toBe(409);

    // Guests can't claim cash; the winner signs up (keeping the account) first.
    expect((await claim(a.token, 'paypal: a@pay.example')).statusCode).toBe(403);
    const reg = await app.inject({ method: 'POST', url: '/auth/register', headers: authed(a.token), payload: { email: 'prize-a@example.com', password: 'correct horse battery' } });
    expect(reg.statusCode).toBe(200);
    expect((await claim(a.token, 'x')).statusCode).toBe(400); // too short
    expect((await claim(a.token, 'paypal: a@pay.example')).statusCode).toBe(200);
    expect((await claim(a.token, 'paypal: a@pay.example')).statusCode).toBe(409);
    expect((await me(a.token)).monthlyPrize).toMatchObject({ status: 'requested' });

    // The owner sees who to pay, and marks it paid afterwards.
    expect((await app.inject({ url: '/internal/monthly-prizes?month=2030-05' })).statusCode).toBe(401);
    const list = (await app.inject({ url: '/internal/monthly-prizes', headers: internal })).json();
    expect(list.month.id).toBe('2030-05');
    expect(list.prizes.map((p: { name: string; amountUsd: number; status: string }) => [p.name, p.amountUsd, p.status])).toEqual([
      ['Prize A', 50, 'requested'],
      ['Prize B', 25, 'unclaimed'],
      ['Prize C', 10, 'unclaimed'],
    ]);
    expect(list.prizes[0]).toMatchObject({ email: 'prize-a@example.com', payoutDetails: 'paypal: a@pay.example' });
    const paid = { method: 'POST' as const, url: '/internal/monthly-prizes/paid', headers: internal, payload: { month: '2030-05', playerId: a.profile.id } };
    expect((await app.inject(paid)).statusCode).toBe(200);
    expect((await app.inject(paid)).statusCode).toBe(404); // already paid
    expect((await me(a.token)).monthlyPrize).toMatchObject({ status: 'paid' });
    clock = saved;
  });
});

describe('duel season bonuses', () => {
  it('top tiers also win an exclusive skin that cannot be bought', async () => {
    const saved = clock;
    const a = await guest('Skin Winner');
    await db.query('INSERT INTO season_ratings (season_id, player_id, rating, wins) VALUES ($1, $2, 1520, 9)', ['2031-01', a.profile.id]);
    clock = new Date('2031-02-05T12:00:00Z');
    const before = (await app.inject({ url: '/me', headers: authed(a.token) })).json() as Profile;
    expect(before.seasonReward).toMatchObject({ tier: 'Diamond', coins: 600, skin: 'diamond' });
    expect(before.owned).not.toContain('diamond');
    const claimed = (await app.inject({ method: 'POST', url: '/me/season-reward', headers: authed(a.token) })).json();
    expect(claimed.profile.owned).toContain('diamond');
    const equip = await app.inject({ method: 'POST', url: '/me/equip', headers: authed(a.token), payload: { itemId: 'diamond' } });
    expect(equip.statusCode).toBe(200);
    const other = await guest('No Skin');
    expect((await app.inject({ method: 'POST', url: '/shop/buy', headers: authed(other.token), payload: { itemId: 'diamond' } })).statusCode).toBe(403);
    expect(FREE_SKINS).not.toContain('diamond');
    clock = saved;
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
