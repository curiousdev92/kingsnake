import { createGame, makeConfig, step, type GameState, type Input } from '@snake/game-core';
import { describe, expect, it } from 'vitest';
import { AdaptiveDelay, Predictor, type ReconcileBase } from '../src';

// Prediction doesn't simulate eating. A huge pelletValue means boosting still burns mass but never drops a
// pellet the server snake could eat, so the exact-match tests compare movement alone.
const cfg = makeConfig({ pelletDensity: 0, shrinkSchedule: [], arenaBaseRadius: 5000, pelletValue: 1e9 });

const inputAt = (c: number): Input => ({ targetAngle: Math.sin(c / 9) * 2.5, boost: c % 45 < 12 });

function baseFrom(s: GameState, lastSeq: number): ReconcileBase {
  const sn = s.snakes[0]!;
  return {
    snake: { id: sn.id, x: sn.head.x, y: sn.head.y, angle: sn.angle, mass: sn.mass, boosting: sn.boosting, body: null },
    path: sn.path,
    arenaRadius: s.arena.radius,
    lastSeq,
  };
}

/**
 * Client sends input c on tick c. It reaches the server L ticks later and is applied
 * on server tick c + L. Snapshots take L ticks back. So the client's prediction at
 * tick c should equal the server's state at tick c + L.
 */
function run(L: number, ticks: number) {
  let server = createGame([{ name: 'me' }], cfg);
  const history: GameState[] = [server];
  const serverLastSeq: number[] = [0];
  const pred = new Predictor(cfg);
  const predicted: { x: number; y: number }[] = [];

  for (let c = 1; c <= ticks; c++) {
    pred.applyInput(c, inputAt(c));

    const applied = c - L;
    const inputs = new Map(applied >= 1 ? [[1, inputAt(applied)]] : []);
    server = step(server, inputs, cfg);
    history[c] = server;
    serverLastSeq[c] = Math.max(0, applied);

    const seen = c - L;
    if (seen >= 0) pred.reconcile(baseFrom(history[seen]!, serverLastSeq[seen]!));
    pred.decay(1e6); // compare the raw prediction, not the eased display
    const v = pred.view(1);
    predicted[c] = v ? { x: v.head.x, y: v.head.y } : { x: NaN, y: NaN };
  }
  // Extend the server so every prediction has a future state to compare with.
  for (let c = ticks + 1; c <= ticks + L; c++) {
    server = step(server, new Map([[1, inputAt(c - L)]]), cfg);
    history[c] = server;
  }
  return { pred, predicted, history };
}

describe('Predictor', () => {
  for (const L of [1, 3, 6]) {
    it(`predicts the server's future exactly with ${L}-tick one-way latency`, () => {
      const { pred, predicted, history } = run(L, 150);
      // Once warmed up, every reconcile lands exactly where the last prediction was.
      expect(pred.lastError).toBeLessThan(1e-6);
      for (let c = 2 * L + 1; c <= 150; c++) {
        const server = history[c + L]!.snakes[0]!.head;
        expect(predicted[c]!.x).toBeCloseTo(server.x, 6);
        expect(predicted[c]!.y).toBeCloseTo(server.y, 6);
      }
    });
  }

  it('smooths small corrections and snaps large ones', () => {
    const p = new Predictor(cfg);
    p.smoothingMs = 100;
    const s = createGame([{ name: 'me' }], cfg);
    p.reconcile(baseFrom(s, 0));
    p.applyInput(1, { targetAngle: 0, boost: false });

    // Server says we are 10 units off: shown position stays put, then eases over.
    const shifted = structuredClone(s);
    shifted.snakes[0]!.head.x += 10;
    const shownBefore = p.view(1)!.head.x;
    p.reconcile(baseFrom(shifted, 0));
    expect(p.lastError).toBeCloseTo(10, 0);
    expect(p.view(1)!.head.x).toBeCloseTo(shownBefore, 6);
    p.decay(100);
    expect(Math.abs(p.view(1)!.head.x - (shownBefore + 10))).toBeLessThan(1);

    // A 200-unit error snaps immediately.
    const far = structuredClone(s);
    far.snakes[0]!.head.x += 200;
    p.reconcile(baseFrom(far, 0));
    expect(p.snaps).toBe(1);
    expect(p.view(1)!.head.x - shownBefore).toBeGreaterThan(150);
  });

  it('drops acknowledged inputs and stops when reset', () => {
    const p = new Predictor(cfg);
    const s = createGame([{ name: 'me' }], cfg);
    for (let i = 1; i <= 5; i++) p.applyInput(i, inputAt(i));
    p.reconcile(baseFrom(s, 5));
    expect(p.view(1)!.head).toEqual(s.snakes[0]!.head); // nothing left to replay
    p.reset();
    expect(p.view(1)).toBeNull();
  });
});

describe('AdaptiveDelay', () => {
  it('settles at high-percentile transit plus one snapshot interval', () => {
    const d = new AdaptiveDelay(1000 / 30);
    // Transit 100 ms with up to 30 ms jitter.
    for (let i = 0; i < 300; i++) d.addSample(100 + ((i * 7) % 31));
    expect(d.targetMs).toBeGreaterThan(125 + 33);
    expect(d.targetMs).toBeLessThan(131 + 34);
    expect(Math.abs(d.delayMs - d.targetMs)).toBeLessThan(2);
  });

  it('moves gradually, never jumping to the target', () => {
    const d = new AdaptiveDelay();
    const start = d.delayMs;
    d.addSample(250);
    expect(d.delayMs).toBeGreaterThan(start);
    expect(d.delayMs).toBeLessThan(start + 30);
  });

  it('stays within bounds', () => {
    const d = new AdaptiveDelay(33, 50, 400);
    for (let i = 0; i < 500; i++) d.addSample(-100);
    expect(d.delayMs).toBeGreaterThanOrEqual(49.9);
    for (let i = 0; i < 500; i++) d.addSample(5000);
    expect(d.delayMs).toBeLessThanOrEqual(400.1);
  });
});
