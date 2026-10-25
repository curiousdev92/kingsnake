import { createSnake, makeConfig } from '@snake/game-core';
import { describe, expect, it } from 'vitest';
import { KEYFRAME_TICKS, Match } from '../src/Match';

const cfg = makeConfig({ shrinkSchedule: [] });
const dtMs = cfg.dt * 1000;

function twoPlayers() {
  return new Match([{ name: 'a' }, { name: 'b' }], cfg, 0, 1);
}

describe('Match', () => {
  it('steps in fixed ticks up to the given time', () => {
    const m = twoPlayers();
    m.advance(dtMs * 5 + 1);
    m.advance(dtMs * 10 + 1);
    expect(m.state.tick).toBe(10);
    expect(m.tickTime(10)).toBeCloseTo(dtMs * 10);
  });

  it('applies inputs and ignores stale sequence numbers', () => {
    const m = twoPlayers();
    m.setInput(1, { seq: 5, targetAngle: 1, boost: true });
    m.setInput(1, { seq: 4, targetAngle: -1, boost: false });
    m.advance(dtMs);
    const s = m.state.snakes[0]!;
    expect(s.targetAngle).toBe(1);
    expect(s.boosting).toBe(true);
    expect(m.lastSeqFor(1)).toBe(5);
    expect(m.snapshot(1, false).lastSeq).toBe(5);
  });

  it('reports pellet spawns, removals and deaths as events', () => {
    const m = twoPlayers();
    // Head straight into b's body.
    m.state.snakes[1] = createSnake(2, 'b', { x: 0, y: 200 }, Math.PI / 2, cfg);
    m.state.snakes[0] = createSnake(1, 'a', { x: -30, y: 100 }, 0, cfg);
    m.state.pellets.push({ id: 999999, x: -20, y: 100, value: 1 });
    const events = [...m.advance(dtMs * 5), ...m.advance(dtMs * 10)];
    const all = events.flatMap((e) => e.removed);
    expect(all).toContain(999999);
    expect(events.flatMap((e) => e.deaths)).toContainEqual({ snakeId: 1, killerId: 2, cause: 'body' });
    expect(events.flatMap((e) => e.added).length).toBeGreaterThan(0); // dropped body
    expect(m.finished).toBe(true);

    const results = m.results();
    expect(results.find((r) => r.snakeId === 2)).toMatchObject({ placement: 1, kills: 1 });
    const loser = results.find((r) => r.snakeId === 1)!;
    expect(loser).toMatchObject({ placement: 2, kills: 0 });
    expect(loser.survivalMs).toBeGreaterThan(0);
    expect(loser.survivalMs).toBeLessThan(dtMs * 15);
  });

  it('full pellet sync contains every pellet', () => {
    const m = twoPlayers();
    const full = m.fullPellets();
    expect(full.reset).toBe(true);
    expect(full.added.length).toBe(m.state.pellets.length);
  });

  it('sends bodies on full snapshots and on staggered keyframes', () => {
    const m = twoPlayers();
    expect(m.snapshot(1, true).snakes.every((s) => s.body !== null)).toBe(true);
    const keyframes = new Map<number, number>();
    for (let i = 0; i < KEYFRAME_TICKS; i++) {
      m.advance(m.tickTime(m.state.tick + 1));
      for (const s of m.snapshot(1, false).snakes) if (s.body) keyframes.set(s.id, (keyframes.get(s.id) ?? 0) + 1);
    }
    expect(keyframes.get(1)).toBe(1);
    expect(keyframes.get(2)).toBe(1);
  });

  it('applies queued inputs one per tick, in order', () => {
    const m = twoPlayers();
    // Two inputs arrive within one tick (jitter): they must not collapse into one.
    m.setInput(1, { seq: 1, targetAngle: 1, boost: false });
    m.setInput(1, { seq: 2, targetAngle: 2, boost: false });
    m.advance(dtMs);
    expect(m.lastSeqFor(1)).toBe(1);
    expect(m.state.snakes[0]!.targetAngle).toBe(1);
    m.advance(dtMs * 2);
    expect(m.lastSeqFor(1)).toBe(2);
    expect(m.state.snakes[0]!.targetAngle).toBe(2);
    // Queue empty: the last input repeats and lastSeq holds.
    m.advance(dtMs * 3);
    expect(m.lastSeqFor(1)).toBe(2);
    expect(m.state.snakes[0]!.targetAngle).toBe(2);
  });

  it('hands a leaving player\'s snake to the bot AI', () => {
    const m = twoPlayers();
    m.convertToBot(2);
    expect(m.state.snakes[1]!.isBot).toBe(true);
  });

  it('slips the clock instead of running unbounded catch-up', () => {
    const m = twoPlayers();
    m.advance(dtMs * 1000);
    expect(m.state.tick).toBe(8);
    m.advance(dtMs * 1001);
    expect(m.state.tick).toBe(9);
  });
});
