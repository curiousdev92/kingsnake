import type { AssetManifest } from './src/types';

/**
 * The asset manifest: asset name -> file. Phase 1 ships no art, so it is empty and
 * every component renders its token-based fallback. To drop in art, add entries here,
 * for example:
 *
 *   nineSlices: {
 *     'button.primary.normal': {
 *       src: { 1: '/ui/button.primary.default.normal@1x.png', 2: '/ui/button.primary.default.normal@2x.png' },
 *       slice: { left: 24, top: 24, right: 24, bottom: 32 },
 *     },
 *   },
 *   icons: { 'icon.coin': { 1: '/ui/icon.coin@1x.png', 2: '/ui/icon.coin@2x.png' } },
 */
export const manifest: AssetManifest = {
  nineSlices: {},
  icons: {},
};
