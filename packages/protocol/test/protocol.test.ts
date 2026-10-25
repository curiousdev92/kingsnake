import { describe, expect, it } from 'vitest';
import {
  decodeEvents,
  decodeInput,
  decodePing,
  decodePong,
  decodeSnapshot,
  dequantizeAngle,
  encodeEvents,
  encodeInput,
  encodePing,
  encodePong,
  encodeSnapshot,
  quantizeAngle,
  type SnapshotMsg,
} from '../src';

describe('quantization', () => {
  it('keeps angles within 16-bit precision and wraps into (-PI, PI]', () => {
    for (const a of [0, 1, -1, Math.PI - 0.001, -Math.PI + 0.001, 7]) {
      const back = dequantizeAngle(quantizeAngle(a));
      const diff = Math.atan2(Math.sin(a - back), Math.cos(a - back));
      expect(Math.abs(diff)).toBeLessThan(1e-4);
    }
  });
});

describe('codecs round-trip', () => {
  it('input', () => {
    const m = decodeInput(encodeInput({ seq: 123456, targetAngle: -2.5, boost: true }));
    expect(m.seq).toBe(123456);
    expect(m.boost).toBe(true);
    expect(m.targetAngle).toBeCloseTo(-2.5, 3);
  });

  it('ping / pong', () => {
    expect(decodePing(encodePing(1234.5))).toBe(1234.5);
    expect(decodePong(encodePong({ clientTime: 1.5, serverTime: 99999.25 }))).toEqual({ clientTime: 1.5, serverTime: 99999.25 });
  });

  it('snapshot with and without body keyframes', () => {
    const msg: SnapshotMsg = {
      tick: 900,
      serverTime: 30000.5,
      lastSeq: 42,
      arenaRadius: 1500,
      arenaTargetRadius: 1125,
      snakes: [
        { id: 1, x: 100.125, y: -2000.5, angle: 1, mass: 33.3, boosting: true, body: null },
        { id: 7, x: -3000, y: 3000, angle: -3, mass: 20, boosting: false, body: [{ x: -3000, y: 3000 }, { x: -3009, y: 3000 }] },
      ],
    };
    const back = decodeSnapshot(encodeSnapshot(msg));
    expect(back.tick).toBe(900);
    expect(back.serverTime).toBe(30000.5);
    expect(back.lastSeq).toBe(42);
    expect(back.arenaRadius).toBe(1500);
    const [a, b] = back.snakes;
    expect(a).toMatchObject({ id: 1, x: 100.125, y: -2000.5, boosting: true, body: null });
    expect(a!.mass).toBeCloseTo(33.3, 4);
    expect(b!.body).toEqual([{ x: -3000, y: 3000 }, { x: -3009, y: 3000 }]);
  });

  it('positions are accurate to 1/16 unit', () => {
    const back = decodeSnapshot(
      encodeSnapshot({ tick: 0, serverTime: 0, lastSeq: 0, arenaRadius: 1, arenaTargetRadius: 1, snakes: [{ id: 1, x: 123.4567, y: -0.03, angle: 0, mass: 1, boosting: false, body: null }] }),
    ).snakes[0]!;
    expect(Math.abs(back.x - 123.4567)).toBeLessThanOrEqual(1 / 16);
    expect(Math.abs(back.y + 0.03)).toBeLessThanOrEqual(1 / 16);
  });

  it('decodes from a subarray with a non-zero byteOffset', () => {
    const bytes = encodeInput({ seq: 9, targetAngle: 0.5, boost: false });
    const padded = new Uint8Array(bytes.length + 5);
    padded.set(bytes, 5);
    expect(decodeInput(padded.subarray(5)).seq).toBe(9);
  });

  it('events', () => {
    const m = decodeEvents(
      encodeEvents({
        tick: 5,
        serverTime: 166.6,
        reset: true,
        added: [{ id: 70000, x: 10, y: 20, value: 2.5 }],
        removed: [1, 2, 3],
        deaths: [
          { snakeId: 3, killerId: 2, cause: 'body' },
          { snakeId: 4, killerId: null, cause: 'arena' },
        ],
      }),
    );
    expect(m).toEqual({
      tick: 5,
      serverTime: 166.6,
      reset: true,
      added: [{ id: 70000, x: 10, y: 20, value: 2.5 }],
      removed: [1, 2, 3],
      deaths: [
        { snakeId: 3, killerId: 2, cause: 'body' },
        { snakeId: 4, killerId: null, cause: 'arena' },
      ],
    });
  });
});
