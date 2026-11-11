import { describe, expect, it } from 'vitest';
import { AVATARS, DEFAULT_AVATAR, MIN_PASSWORD_LENGTH, getAvatar, normalizeEmail, passwordProblem } from '../src';

describe('accounts', () => {
  it('normalizes emails and rejects junk', () => {
    expect(normalizeEmail('  Ann@Example.COM ')).toBe('ann@example.com');
    expect(normalizeEmail('no-at-sign')).toBe('');
    expect(normalizeEmail('a@b')).toBe('');
    expect(normalizeEmail(42)).toBe('');
  });

  it('checks password length', () => {
    expect(passwordProblem('x'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(passwordProblem('x'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/);
    expect(passwordProblem(undefined)).not.toBeNull();
  });

  it('has unique avatars including the default', () => {
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    expect(getAvatar(DEFAULT_AVATAR)).toBeDefined();
  });
});
