import { manifest } from "../assets.manifest";
import type { AssetManifest, ImageSource, SkinArt } from "./types";

export * from "./types";
export { manifest };

/** Art for a snake skin, or undefined so the renderer draws palette circles. */
export function getSkinArt(skinId: string): SkinArt | undefined {
  return (manifest as AssetManifest).skins?.[skinId];
}

/** Picks the best export scale for the display, falling back to the nearest smaller one. */
export function resolveSrc(
  src: ImageSource,
  pixelRatio = globalThis.devicePixelRatio ?? 1,
): string {
  if (typeof src === "string") return src;
  const want = Math.min(3, Math.max(1, Math.ceil(pixelRatio)));
  for (let s = want; s >= 1; s--) {
    const hit = src[s as 1 | 2 | 3];
    if (hit) return hit;
  }
  return src[1];
}
