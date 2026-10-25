import { setManifest, shippedManifest } from '@snake/assets';
import { afterEach, describe, expect, it } from 'vitest';
import { fallbackGlyph } from '../src/Icon';
import { parseDuration } from '../src/motion';
import { nineSliceStyle, resolveSkin } from '../src/skin';

const slice = { left: 10, top: 12, right: 10, bottom: 16 };

afterEach(() => setManifest(shippedManifest));

describe('nineSliceStyle', () => {
  it('returns null without art so components use token fallbacks', () => {
    expect(nineSliceStyle(undefined, 'normal')).toBeNull();
    expect(nineSliceStyle({}, 'pressed')).toBeNull();
  });

  it('draws the state image with its slice insets', () => {
    const style = nineSliceStyle({ normal: { src: 'n.png', slice }, pressed: { src: 'p.png', slice } }, 'pressed');
    expect(style).toMatchObject({
      borderWidth: '12px 10px 16px 10px',
      borderImageSource: 'url("p.png")',
      borderImageSlice: '12 10 16 10 fill',
    });
  });

  it('falls back to the normal state image', () => {
    expect(nineSliceStyle({ normal: { src: 'n.png', slice } }, 'disabled')?.borderImageSource).toBe('url("n.png")');
  });
});

describe('resolveSkin', () => {
  it('prefers an explicit skin, else reads the manifest', () => {
    const explicit = { normal: { src: 'mine.png', slice } };
    expect(resolveSkin(explicit, 'button.primary', ['normal'])).toBe(explicit);
    expect(resolveSkin(undefined, 'button.primary', ['normal'])).toBeUndefined();

    setManifest({ nineSlices: { 'button.primary.pressed': { src: 'art.png', slice } }, icons: {} });
    expect(resolveSkin(undefined, 'button.primary', ['normal', 'pressed'])).toEqual({ pressed: { src: 'art.png', slice } });
  });
});

describe('helpers', () => {
  it('parses token durations', () => {
    expect(parseDuration('180ms', 0)).toBe(180);
    expect(parseDuration('0.6s', 0)).toBe(600);
    expect(parseDuration('fast', 42)).toBe(42);
  });

  it('gives every icon a fallback glyph', () => {
    expect(fallbackGlyph('icon.close')).toBe('✕');
    expect(fallbackGlyph('icon.shop')).toBe('S');
  });
});
