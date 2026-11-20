/** One file, or one file per export scale. */
export type ImageSource = string | { 1: string; 2?: string; 3?: string };

export interface AssetManifest {
  /** Snake skin art by skin id (`@snake/meta` SKINS). Skins without an entry draw as palette circles. */
  skins?: Partial<Record<string, SkinArt>>;
}

/**
 * Parts of a snake skin. Every part is drawn facing right and the engine rotates it along the body.
 */
export type SkinPart =
  | "head"
  | "head.boost"
  | "eyes"
  | "body.segment"
  | "body.segment.alt"
  | "tail.tip";

export interface SkinArtBase {
  /** Multiply the art by the skin's palette colours (one per band). */
  tint?: boolean;
}

/** A skin as an atlas: spritesheet JSON whose frames are named by `SkinPart`. */
export interface SkinAtlas extends SkinArtBase {
  atlas: string;
}

/** A skin as loose image files, one per part. */
export interface SkinFiles extends SkinArtBase {
  parts: Partial<Record<SkinPart, ImageSource>> & Record<"head" | "body.segment", ImageSource>;
}

export type SkinArt = SkinAtlas | SkinFiles;
