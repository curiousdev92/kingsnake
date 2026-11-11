import { afterEach, describe, expect, it } from 'vitest';
import { manifest } from '../assets.manifest';
import { getIcon, getNineSlice, resolveSrc, setManifest, skinFor } from '../src';

const slice = { left: 8, top: 8, right: 8, bottom: 8 };

afterEach(() => setManifest(manifest));

describe('manifest lookups', () => {
  it('returns undefined for missing art so callers fall back', () => {
    expect(getNineSlice('button.primary.normal')).toBeUndefined();
    expect(getIcon('icon.coin')).toBeUndefined();
    expect(skinFor('button.primary', ['normal', 'pressed'])).toBeUndefined();
  });

  it('builds a skin from whichever states have art', () => {
    setManifest({
      nineSlices: { 'button.primary.normal': { src: 'n.png', slice } },
      icons: {},
    });
    expect(skinFor('button.primary', ['normal', 'pressed', 'disabled'])).toEqual({
      normal: { src: 'n.png', slice },
    });
  });
});

describe('resolveSrc', () => {
  const src = { 1: 'a@1x.png', 2: 'a@2x.png' };

  it('picks the scale for the pixel ratio', () => {
    expect(resolveSrc(src, 1)).toBe('a@1x.png');
    expect(resolveSrc(src, 1.5)).toBe('a@2x.png');
  });

  it('falls back to the nearest smaller scale', () => {
    expect(resolveSrc(src, 3)).toBe('a@2x.png');
  });

  it('passes plain strings through', () => {
    expect(resolveSrc('x.png', 2)).toBe('x.png');
  });
});
