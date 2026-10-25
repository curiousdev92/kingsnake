import { token } from '@snake/design-tokens';
import type { CSSProperties, ReactNode } from 'react';
import { nineSliceStyle, resolveSkin, type Skin } from './skin';

export interface BadgeProps {
  /** Number to show; 0 or undefined hides the badge. `true` shows a plain dot. */
  count?: number | boolean;
  max?: number;
  children: ReactNode;
  /** Defaults to the manifest's `badge.notification.normal`; without art it renders from tokens. */
  skin?: Skin<'normal'>;
}

/** Notification badge pinned to the top-right corner of its child. */
export function Badge({ count, max = 99, children, skin }: BadgeProps) {
  const visible = count === true || (typeof count === 'number' && count > 0);
  const text = typeof count === 'number' ? (count > max ? `${max}+` : String(count)) : '';
  const look: CSSProperties = nineSliceStyle(resolveSkin(skin, 'badge.notification', ['normal'] as const), 'normal') ?? {
    background: token('color.accent'),
    color: token('color.textOnAccent'),
    border: `${token('border.width')} solid ${token('color.background')}`,
    borderRadius: token('radius.chip'),
  };
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      {visible && (
        <span
          aria-label={text ? `${text} new` : 'new'}
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: text ? 20 : 12,
            height: text ? 20 : 12,
            padding: text ? '0 5px' : 0,
            boxSizing: 'border-box',
            display: 'grid',
            placeItems: 'center',
            fontFamily: token('font.display'),
            fontSize: 11,
            lineHeight: 1,
            pointerEvents: 'none',
            ...look,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
