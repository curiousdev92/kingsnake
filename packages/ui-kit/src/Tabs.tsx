import { token } from '@snake/design-tokens';
import type { CSSProperties, KeyboardEvent } from 'react';
import { nineSliceStyle, resolveSkin, type Skin } from './skin';

export interface TabItem<V extends string> {
  value: V;
  label: string;
}

export interface TabsProps<V extends string> {
  items: readonly TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Defaults to the manifest's `tab.*`; without art it renders from tokens. */
  skin?: Skin<'normal' | 'selected'>;
}

export function Tabs<V extends string>({ items, value, onChange, skin }: TabsProps<V>) {
  const resolved = resolveSkin(skin, 'tab', ['normal', 'selected'] as const);

  // Arrow keys move between tabs, per the WAI-ARIA tabs pattern.
  const onKeyDown = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.value === value);
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = items[(i + delta + items.length) % items.length]!;
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div role="tablist" onKeyDown={onKeyDown} style={{ display: 'flex', gap: token('space.xs') }}>
      {items.map((t) => {
        const selected = t.value === value;
        const look: CSSProperties = nineSliceStyle(resolved, selected ? 'selected' : 'normal') ?? {
          background: selected ? token('color.accent') : token('color.surface'),
          color: selected ? token('color.textOnAccent') : token('color.text'),
          border: `${token('border.width')} solid ${selected ? token('color.border') : token('color.textMuted')}`,
          borderRadius: token('radius.button'),
        };
        return (
          <button
            key={t.value}
            role="tab"
            data-value={t.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            style={{
              flex: 1,
              padding: `${token('space.sm')} ${token('space.md')}`,
              fontFamily: token('font.display'),
              fontSize: token('font.sizeSm'),
              cursor: 'pointer',
              color: token('color.text'),
              ...look,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
