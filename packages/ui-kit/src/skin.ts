import type { CSSProperties } from 'react';

/** Slice insets in 1x pixels, matching the `*.slice.json` sidecars in ART_SPEC.md. */
export interface SliceInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One 9-slice image: fixed corners, stretchable edges and center. */
export interface NineSlice {
  src: string;
  slice: SliceInsets;
}

/** A skin maps component states to 9-slice images. Missing states fall back to `normal`. */
export type Skin<State extends string = string> = Partial<Record<State, NineSlice>> & { normal?: NineSlice };

/**
 * Styles that draw a 9-slice image as the element's frame, or `null` when the
 * skin has no image for this state, so the caller uses its token-based fallback.
 */
export function nineSliceStyle<S extends string>(skin: Skin<S> | undefined, state: S): CSSProperties | null {
  const img = skin?.[state] ?? skin?.normal;
  if (!img) return null;
  const { top, right, bottom, left } = img.slice;
  return {
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderWidth: `${top}px ${right}px ${bottom}px ${left}px`,
    borderImageSource: `url("${img.src}")`,
    borderImageSlice: `${top} ${right} ${bottom} ${left} fill`,
    borderImageRepeat: 'stretch',
    background: 'none',
  };
}
