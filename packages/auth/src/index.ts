import { SignJWT, jwtVerify } from 'jose';

/**
 * Player session tokens: HS256 JWTs whose subject is the player id. The API issues
 * them; the API and game-server verify them with the shared `AUTH_SECRET`.
 *
 * Guest accounts are the only kind today. When a provider (Supabase, Firebase:
 * Google/Apple) is added, the API exchanges the provider's token for one of these,
 * so the game-server never needs to know about providers.
 */

const ISSUER = 'snake-arena';
const DEV_SECRET = 'dev-only-secret-do-not-use-in-production';
const DEV_INTERNAL_KEY = 'dev-only-internal-key';

function requiredInProduction(name: string, devValue: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error(`${name} must be set in production`);
  return devValue;
}

/** Secret for signing player tokens. Must be set (and shared by api + game-server) in production. */
export function authSecret(): string {
  return requiredInProduction('AUTH_SECRET', DEV_SECRET);
}

/** Shared key for server-to-server calls (game-server -> api `/internal/*`). */
export function internalKey(): string {
  return requiredInProduction('INTERNAL_KEY', DEV_INTERNAL_KEY);
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signPlayerToken(playerId: string, secret = authSecret(), ttl = '365d'): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(playerId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(key(secret));
}

/** The player id in a valid token, or null for anything invalid, expired or forged. */
export async function verifyPlayerToken(token: unknown, secret = authSecret()): Promise<string | null> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
