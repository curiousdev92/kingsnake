import { createGame, makeConfig, step } from '@snake/game-core';
import { describe, expect, it } from 'vitest';
import { ClockSync, NetworkSimulator, RemoteWorld, SnapshotBuffer } from '../src';

describe('ClockSync', () => {
  it('uses the lowest-RTT sample', () => {
    const c = new ClockSync();
    // True offset is +1000. A slow sample with asymmetric delay would mislead.
    c.addSample(0, 1000 + 200, 210); // rtt 210, request leg took 200ms
    c.addSample(300, 1000 + 305, 310); // rtt 10
    expect(c.serverNow(500)).toBeCloseTo(1500, 0);
    expect(c.rtt).toBe(10);
  });
});

describe('SnapshotBuffer', () => {
  const buf = () => {
    const b = new SnapshotBuffer<{ serverTime: number }>(50);
    for (const t of [0, 100, 200]) b.push({ serverTime: t });
    return b;
  };

  it('interpolates between the surrounding pair', () => {
    const s = buf().sample(150)!;
    expect(s.a.serverTime).toBe(100);
    expect(s.b.serverTime).toBe(200);
    expect(s.t).toBeCloseTo(0.5);
  });

  it('extrapolates a limited amount past the newest snapshot', () => {
    const s = buf().sample(400)!;
    expect(s.extrapolating).toBe(true);
    expect(s.t).toBeCloseTo(1.5); // capped at 50ms over a 100ms span
  });

  it('drops out-of-order snapshots', () => {
    const b = buf();
    expect(b.push({ serverTime: 150 })).toBe(false);
    expect(b.latest?.serverTime).toBe(200);
  });
});

describe('NetworkSimulator', () => {
  function harness(random: () => number) {
    let now = 0;
    const queue: { at: number; fn: () => void }[] = [];
    const sim = new NetworkSimulator(
      { latencyMs: 100, jitterMs: 50, loss: 0.5 },
      { now: () => now, random, schedule: (fn, ms) => queue.push({ at: now + ms, fn }) },
    );
    const flush = () => {
      queue.sort((a, b) => a.at - b.at);
      for (const q of queue) q.fn();
    };
    return { sim, queue, flush, setNow: (t: number) => (now = t) };
  }

  it('drops unreliable messages by the loss rate but never reliable ones', () => {
    const { sim, queue } = harness(() => 0.1);
    sim.deliver(() => {}, false);
    sim.deliver(() => {}, true);
    expect(queue.length).toBe(1);
  });

  it('keeps reliable messages in order despite jitter', () => {
    const rolls = [0.99, 0.0]; // first message gets max jitter, second none
    const { sim, flush, setNow } = harness(() => rolls.shift() ?? 0);
    const got: number[] = [];
    sim.deliver(() => got.push(1), true);
    setNow(1);
    sim.deliver(() => got.push(2), true);
    flush();
    expect(got).toEqual([1, 2]);
  });
});

describe('RemoteWorld', () => {
  it('rebuilds bodies from head positions to match the server', () => {
    const cfg = makeConfig({ pelletDensity: 0, shrinkSchedule: [] });
    let state = createGame([{ name: 'a' }], cfg);
    const world = new RemoteWorld(cfg);
    const snap = (body: boolean) => ({
      tick: state.tick,
      serverTime: state.tick * 33,
      lastSeq: 0,
      arenaRadius: state.arena.radius,
      arenaTargetRadius: state.arena.targetRadius,
      snakes: state.snakes.map((s) => ({ id: s.id, x: s.head.x, y: s.head.y, angle: s.angle, mass: s.mass, boosting: false, body: body ? s.segments : null })),
    });
    world.applySnapshot(snap(true));
    const turn = new Map([[1, { targetAngle: 1.2, boost: false }]]);
    for (let i = 0; i < 40; i++) {
      state = step(state, turn, cfg);
      world.applySnapshot(snap(false));
    }
    const view = world.buffer.latest!.snakes[0]!;
    const server = state.snakes[0]!;
    expect(view.segments.length).toBe(server.segments.length);
    for (let k = 0; k < server.segments.length; k++) {
      expect(view.segments[k]!.x).toBeCloseTo(server.segments[k]!.x, 0);
      expect(view.segments[k]!.y).toBeCloseTo(server.segments[k]!.y, 0);
    }
  });

  it('applies pellet events only when render time reaches them', () => {
    const world = new RemoteWorld(makeConfig());
    world.queueEvents({ tick: 1, serverTime: 100, reset: true, added: [{ id: 1, x: 0, y: 0, value: 1 }], removed: [], deaths: [] });
    world.queueEvents({ tick: 2, serverTime: 200, reset: false, added: [], removed: [1], deaths: [{ snakeId: 3, killerId: null, cause: 'arena' }] });
    world.applyEventsUntil(150);
    expect(world.pelletCount).toBe(1);
    const deaths = world.applyEventsUntil(250);
    expect(world.pelletCount).toBe(0);
    expect(deaths).toEqual([{ snakeId: 3, killerId: null, cause: 'arena' }]);
  });
});
