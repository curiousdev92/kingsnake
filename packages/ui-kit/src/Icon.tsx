import { getIcon, resolveSrc, type IconName } from '@snake/assets';
import { token } from '@snake/design-tokens';

// Text stand-ins until icon art exists. Anything unlisted shows its first letter.
const GLYPHS: Partial<Record<IconName, string>> = {
  'icon.coin': '●',
  'icon.gem': '◆',
  'icon.xp': '★',
  'icon.trophy': 'T',
  'icon.play': '▶',
  'icon.close': '✕',
  'icon.back': '‹',
  'icon.crown': '♛',
  'icon.skull': '☠',
  'icon.heart': '♥',
  'icon.settings': '⚙',
  'icon.clock': '◷',
};

export function fallbackGlyph(name: IconName): string {
  return GLYPHS[name] ?? name.split('.')[1]!.charAt(0).toUpperCase();
}

export interface IconProps {
  name: IconName;
  size?: number;
  /** Accessible label; omit for decorative icons. */
  label?: string;
}

/** An icon from the manifest, or a text glyph in the same box when the art is missing. */
export function Icon({ name, size = 20, label }: IconProps) {
  const src = getIcon(name);
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  if (src) {
    return <img src={resolveSrc(src)} width={size} height={size} alt={label ?? ''} draggable={false} style={{ display: 'block' }} />;
  }
  return (
    <span
      {...a11y}
      data-fallback={name}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        fontSize: size * 0.7,
        lineHeight: 1,
        fontFamily: token('font.display'),
        color: 'currentColor',
      }}
    >
      {fallbackGlyph(name)}
    </span>
  );
}
