/** A profile picture. Until avatar art exists (`avatar.<id>` in ART_SPEC.md), it is a glyph on a colour. */
export interface Avatar {
  id: string;
  name: string;
  glyph: string;
  color: string;
}

export const AVATARS: readonly Avatar[] = [
  { id: 'snake', name: 'Snake', glyph: 'S', color: '#3ddc84' },
  { id: 'crown', name: 'Crown', glyph: '♛', color: '#f5c542' },
  { id: 'skull', name: 'Skull', glyph: '☠', color: '#b0b0b0' },
  { id: 'star', name: 'Star', glyph: '★', color: '#ff8a3d' },
  { id: 'bolt', name: 'Bolt', glyph: 'ϟ', color: '#4fc3f7' },
  { id: 'heart', name: 'Heart', glyph: '♥', color: '#ff5c8a' },
];

export const DEFAULT_AVATAR = 'snake';

export const getAvatar = (id: string): Avatar | undefined => AVATARS.find((a) => a.id === id);

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 254;

/** Lowercased, trimmed email, or '' when it doesn't look like one. */
export function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  const clean = email.trim().toLowerCase();
  return clean.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : '';
}

/** Why a password is not acceptable, or null when it is. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  return null;
}
