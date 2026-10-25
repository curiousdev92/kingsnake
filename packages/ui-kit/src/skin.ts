import { resolveSrc, skinFor, type NineSlice } from '@snake/assets';
import type { CSSProperties } from 'react';

export type { NineSlice, SliceInsets } from '@snake/assets';

/** A skin maps component states to 9-slice images. Missing states fall back to `normal`. */
export type Skin<State extends string = string> = Partial<Record<State | 'normal', NineSlice>>;

/**
 * The skin to draw with: an explicit `skin` prop wins, otherwise the manifest's
 * `<prefix>.<state>` entries. Undefined means no art, so render from tokens.
 */
export function resolveSkin<S extends string>(explicit: NoInfer<Skin<S>> | undefined, prefix: string, states: readonly S[]): Skin<S> | undefined {
  return explicit ?? (skinFor(prefix, states) as Skin<S> | undefined);
}

/**
 * Styles that draw a 9-slice image as the element's frame, or `null` when the
 * skin has no image for this state, so the caller uses its token-based fallback.
 */
export function nineSliceStyle<S extends string>(skin: NoInfer<Skin<S>> | undefined, state: S): CSSProperties | null {
  const img = skin?.[state] ?? skin?.normal;
  if (!img) return null;
  const { top, right, bottom, left } = img.slice;
  return {
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderWidth: `${top}px ${right}px ${bottom}px ${left}px`,
    borderImageSource: `url("${resolveSrc(img.src)}")`,
    borderImageSlice: `${top} ${right} ${bottom} ${left} fill`,
    borderImageRepeat: 'stretch',
    background: 'none',
  };
}
