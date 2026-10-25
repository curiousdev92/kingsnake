import type { PanelKind } from '@snake/assets';
import { token } from '@snake/design-tokens';
import type { CSSProperties, HTMLAttributes } from 'react';
import { nineSliceStyle, resolveSkin, type Skin } from './skin';

export type PanelVariant = PanelKind | 'inset';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** `inset` is for list rows and slots; it supports `selected`. */
  variant?: PanelVariant;
  selected?: boolean;
  /** 9-slice frame art. Defaults to the manifest's `panel.<variant>.*`; without art it renders from tokens. */
  skin?: Skin<'normal' | 'selected'>;
}

const fallback: Record<PanelVariant, CSSProperties> = {
  main: { background: token('color.surface') },
  dark: { background: token('color.surfaceRaised') },
  gold: { background: token('color.surface'), borderStyle: 'double', borderWidth: '4px' },
  inset: { background: token('color.surfaceRaised'), borderRadius: token('radius.button') },
};

export function Panel({ variant = 'main', selected = false, skin, style, ...rest }: PanelProps) {
  const state = selected ? 'selected' : 'normal';
  const resolved = resolveSkin(skin, `panel.${variant}`, ['normal', 'selected'] as const);
  const look: CSSProperties = nineSliceStyle(resolved, state) ?? {
    border: `${token('border.width')} solid ${selected ? token('color.accent') : token('color.border')}`,
    borderRadius: token('radius.panel'),
    boxShadow: token('shadow.panel'),
    ...fallback[variant],
    ...(variant === 'inset' && !selected && { borderColor: token('color.textMuted') }),
  };
  return (
    <div
      {...rest}
      data-state={state}
      style={{
        color: token('color.text'),
        fontFamily: token('font.body'),
        padding: variant === 'inset' ? token('space.md') : token('space.lg'),
        ...look,
        ...style,
      }}
    />
  );
}
