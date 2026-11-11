/** Slice insets in 1x pixels, matching the `*.slice.json` sidecars in ART_SPEC.md. */
export interface SliceInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One file, or one file per export scale (ART_SPEC: @1x/@2x/@3x). */
export type ImageSource = string | { 1: string; 2?: string; 3?: string };

/** One 9-slice image: fixed corners, stretchable edges and center. */
export interface NineSlice {
  src: ImageSource;
  slice: SliceInsets;
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'icon';
export type ButtonState = 'normal' | 'pressed' | 'disabled';
export type PanelKind = 'main' | 'dark' | 'gold';
export type ChipKind = 'default' | 'gold' | 'gem';
export type ProgressKind = 'xp' | 'health' | 'timer';

/** Every 9-slice UI element from ART_SPEC.md section 4, as `<element>.<variant>.<state>`. */
export type NineSliceName =
  | `button.${ButtonKind}.${ButtonState}`
  | `panel.${PanelKind}.normal`
  | `panel.inset.${'normal' | 'selected'}`
  | 'modal.frame.normal'
  | `chip.${ChipKind}.normal`
  | `progressbar.${'track' | 'fill'}.${ProgressKind}`
  | `tab.${'normal' | 'selected'}`
  | 'badge.notification.normal';

/** Single-image icons from ART_SPEC.md section 5. */
export type IconName =
  | 'icon.coin' | 'icon.gem' | 'icon.xp' | 'icon.trophy'
  | 'icon.play' | 'icon.shop' | 'icon.profile' | 'icon.friends' | 'icon.missions' | 'icon.settings' | 'icon.leaderboard'
  | 'icon.close' | 'icon.back' | 'icon.copy' | 'icon.share' | 'icon.sound.on' | 'icon.sound.off' | 'icon.vibration'
  | 'icon.crown' | 'icon.skull' | 'icon.clock' | 'icon.heart' | 'icon.speed' | 'icon.shield';

export interface AssetManifest {
  nineSlices: Partial<Record<NineSliceName, NineSlice>>;
  icons: Partial<Record<IconName, ImageSource>>;
  /** Snake skin art by skin id (`@snake/meta` SKINS). Skins without an entry draw as palette circles. */
  skins?: Partial<Record<string, SkinArt>>;
}

/**
 * Parts of a snake skin from ART_SPEC.md section 8. Every part is drawn facing right,
 * meaning toward the head, and the engine rotates it along the body. Sizes are in 1x
 * pixels relative to a 64 px segment, which is drawn as wide as the snake: a 96 px
 * head comes out 1.5 times the body width.
 */
export type SkinPart = 'head' | 'head.boost' | 'eyes' | 'body.segment' | 'body.segment.alt' | 'tail.tip';

/** Only `head` and `body.segment` are required; the others fall back to them. */
export interface SkinArtBase {
  /**
   * Multiply the art by the skin's palette colours (one per band), so one greyscale
   * set can serve several skins. Off by default: art keeps its own colours.
   */
  tint?: boolean;
}

/** A skin as an atlas: Pixi/TexturePacker spritesheet JSON whose frames are named by `SkinPart`. */
export interface SkinAtlas extends SkinArtBase {
  atlas: string;
}

/** A skin as loose image files, one per part (handy while iterating on art). */
export interface SkinFiles extends SkinArtBase {
  parts: Partial<Record<SkinPart, ImageSource>> & Record<'head' | 'body.segment', ImageSource>;
}

export type SkinArt = SkinAtlas | SkinFiles;
