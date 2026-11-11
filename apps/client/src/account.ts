import type { Leaderboard, Profile } from '@snake/meta';
import { create } from 'zustand';

/**
 * The player's account: a guest session against the meta API, created on first
 * launch and kept as a token in localStorage. The API is optional for playing: if it
 * is unreachable the game still works, just without profile, shop or rewards.
 */
export interface AccountState {
  status: 'loading' | 'ready' | 'offline';
  profile: Profile | null;
}

export const useAccount = create<AccountState>(() => ({ status: 'loading', profile: null }));

export const API_URL: string = import.meta.env.VITE_API_URL ?? `http://${location.hostname}:3000`;

const TOKEN_KEY = 'snake.token';
const NAME_KEY = 'snake.name';

// Storage can be unavailable (private mode, blocked site data): every access is guarded.
function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function sessionToken(): string | null {
  return storageGet(TOKEN_KEY);
}

/** Name typed before an account existed (or while offline). */
export const savedName = () => storageGet(NAME_KEY) ?? '';
export const saveName = (name: string) => storageSet(NAME_KEY, name);

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = sessionToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiFailure(res.status, json.error ?? 'error', json.message ?? `HTTP ${res.status}`);
  return json as T;
}

const setProfile = (profile: Profile) => useAccount.setState({ status: 'ready', profile });

/** Signs in with the stored token, or creates a guest account. Never throws. */
export async function initAccount(): Promise<void> {
  try {
    if (sessionToken()) {
      try {
        setProfile(await call<Profile>('GET', '/me'));
        return;
      } catch (e) {
        // Token rejected or account gone: start a fresh guest. Anything else is "offline".
        if (!(e instanceof ApiFailure && (e.status === 401 || e.status === 404))) throw e;
        storageSet(TOKEN_KEY, null);
      }
    }
    const { token, profile } = await call<{ token: string; profile: Profile }>('POST', '/auth/guest', { name: savedName() });
    storageSet(TOKEN_KEY, token);
    setProfile(profile);
  } catch {
    useAccount.setState({ status: 'offline', profile: null });
  }
}

export async function refreshProfile(): Promise<void> {
  try {
    setProfile(await call<Profile>('GET', '/me'));
  } catch {
    // keep what we have
  }
}

export async function rename(name: string): Promise<void> {
  setProfile(await call<Profile>('PATCH', '/me', { name }));
}

export async function claimDaily(): Promise<number> {
  const res = await call<{ coins: number; profile: Profile }>('POST', '/me/daily');
  setProfile(res.profile);
  return res.coins;
}

export async function claimSeasonReward(): Promise<number> {
  const res = await call<{ coins: number; profile: Profile }>('POST', '/me/season-reward');
  setProfile(res.profile);
  return res.coins;
}

/** A season's leaderboard (default: the current one); includes your own line when signed in. */
export function fetchLeaderboard(seasonId?: string): Promise<Leaderboard> {
  return call<Leaderboard>('GET', seasonId ? `/leaderboard?season=${encodeURIComponent(seasonId)}` : '/leaderboard');
}

export async function buySkin(itemId: string): Promise<void> {
  setProfile(await call<Profile>('POST', '/shop/buy', { itemId }));
}

export async function equipSkin(itemId: string): Promise<void> {
  setProfile(await call<Profile>('POST', '/me/equip', { itemId }));
}
