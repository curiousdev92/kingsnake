import { manifest as shipped } from '../assets.manifest';
import type { AssetManifest, IconName, ImageSource, NineSlice, NineSliceName } from './types';

export * from './types';
/** The manifest checked into the repo. */
export { shipped as shippedManifest };

let active: AssetManifest = shipped;

/** Replaces the manifest in use (tests, or loading a remote manifest later). */
export function setManifest(m: AssetManifest): void {
  active = m;
}

/** The 9-slice for a name, or undefined so the caller renders its fallback. */
export function getNineSlice(name: NineSliceName): NineSlice | undefined {
  return active.nineSlices[name];
}

export function getIcon(name: IconName): ImageSource | undefined {
  return active.icons[name];
}

/**
 * Collects `<prefix>.<state>` entries into a state -> 9-slice map.
 * Returns undefined when no state has art, so components fall back to tokens.
 */
export function skinFor<S extends string>(prefix: string, states: readonly S[]): Partial<Record<S, NineSlice>> | undefined {
  const out: Partial<Record<S, NineSlice>> = {};
  let found = false;
  for (const s of states) {
    const entry = active.nineSlices[`${prefix}.${s}` as NineSliceName];
    if (entry) {
      out[s] = entry;
      found = true;
    }
  }
  return found ? out : undefined;
}

/** Picks the best export scale for the display, falling back to the nearest smaller one. */
export function resolveSrc(src: ImageSource, pixelRatio = globalThis.devicePixelRatio ?? 1): string {
  if (typeof src === 'string') return src;
  const want = Math.min(3, Math.max(1, Math.ceil(pixelRatio)));
  for (let s = want; s >= 1; s--) {
    const hit = src[s as 1 | 2 | 3];
    if (hit) return hit;
  }
  return src[1];
}
