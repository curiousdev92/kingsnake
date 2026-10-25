import { token } from '@snake/design-tokens';
import type { CSSProperties, HTMLAttributes } from 'react';
import { nineSliceStyle, type Skin } from './skin';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** 9-slice frame art. Without it the panel renders from tokens only. */
  skin?: Skin<'normal'>;
}

export function Panel({ skin, style, ...rest }: PanelProps) {
  const look: CSSProperties = nineSliceStyle(skin, 'normal') ?? {
    background: token('color.surface'),
    border: `${token('border.width')} solid ${token('color.border')}`,
    borderRadius: token('radius.panel'),
    boxShadow: token('shadow.panel'),
  };
  return (
    <div
      {...rest}
      style={{
        color: token('color.text'),
        fontFamily: token('font.body'),
        padding: token('space.lg'),
        ...look,
        ...style,
      }}
    />
  );
}
