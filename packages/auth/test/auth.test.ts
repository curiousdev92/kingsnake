import { describe, expect, it } from 'vitest';
import { signPlayerToken, verifyPlayerToken } from '../src';

describe('player tokens', () => {
  it('round-trips the player id', async () => {
    const token = await signPlayerToken('player-1', 'secret-a');
    expect(await verifyPlayerToken(token, 'secret-a')).toBe('player-1');
  });

  it('rejects other secrets, tampering, expiry and junk', async () => {
    const token = await signPlayerToken('player-1', 'secret-a');
    expect(await verifyPlayerToken(token, 'secret-b')).toBeNull();
    const [h, p, s] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'admin', iss: 'snake-arena' })).toString('base64url')}.${s}`;
    expect(p).toBeDefined();
    expect(await verifyPlayerToken(forged, 'secret-a')).toBeNull();
    expect(await verifyPlayerToken(await signPlayerToken('p', 'secret-a', '-1s'), 'secret-a')).toBeNull();
    expect(await verifyPlayerToken('not-a-jwt', 'secret-a')).toBeNull();
    expect(await verifyPlayerToken(undefined, 'secret-a')).toBeNull();
  });
});
