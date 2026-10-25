import type { ChipKind } from '@snake/assets';
import { token } from '@snake/design-tokens';
import type { CSSProperties, HTMLAttributes } from 'react';
import { nineSliceStyle, resolveSkin, type Skin } from './skin';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipKind;
  /** Defaults to the manifest's `chip.<variant>.normal`; without art it renders from tokens. */
  skin?: Skin<'normal'>;
}

/** Small pill for labels and currency amounts. */
export function Chip({ variant = 'default', skin, style, ...rest }: ChipProps) {
  const look: CSSProperties = nineSliceStyle(resolveSkin(skin, `chip.${variant}`, ['normal'] as const), 'normal') ?? {
    background: token('color.surface'),
    border: `${token('border.width')} solid ${variant === 'default' ? token('color.textMuted') : token('color.border')}`,
    borderRadius: token('radius.chip'),
  };
  return (
    <span
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: token('space.xs'),
        padding: `${token('space.xs')} ${token('space.md')}`,
        color: token('color.text'),
        fontFamily: token('font.display'),
        fontSize: token('font.sizeSm'),
        whiteSpace: 'nowrap',
        ...look,
        ...style,
      }}
    />
  );
}
