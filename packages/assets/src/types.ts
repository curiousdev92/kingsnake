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
}
