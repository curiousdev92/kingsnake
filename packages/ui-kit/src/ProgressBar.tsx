import { getNineSlice, type ProgressKind } from '@snake/assets';
import { token } from '@snake/design-tokens';
import type { CSSProperties } from 'react';
import { nineSliceStyle } from './skin';

export interface ProgressBarProps {
  /** 0..1, clamped. */
  value: number;
  kind?: ProgressKind;
  height?: number;
  label?: string;
}

/** Track + fill, each skinned from `progressbar.track.<kind>` / `progressbar.fill.<kind>`. */
export function ProgressBar({ value, kind = 'xp', height = 14, label }: ProgressBarProps) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const track: CSSProperties = nineSliceStyle({ normal: getNineSlice(`progressbar.track.${kind}`) }, 'normal') ?? {
    background: token('color.track'),
    border: `${token('border.width')} solid ${token('color.border')}`,
    borderRadius: token('radius.chip'),
  };
  const fill: CSSProperties = nineSliceStyle({ normal: getNineSlice(`progressbar.fill.${kind}`) }, 'normal') ?? {
    background: token('color.accent'),
    borderRadius: token('radius.chip'),
  };
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      style={{ height, boxSizing: 'border-box', overflow: 'hidden', ...track }}
    >
      <div
        style={{
          height: '100%',
          width: `${v * 100}%`,
          boxSizing: 'border-box',
          transition: `width ${token('motion.countUp.duration')} ${token('motion.countUp.easing')}`,
          ...fill,
        }}
      />
    </div>
  );
}
