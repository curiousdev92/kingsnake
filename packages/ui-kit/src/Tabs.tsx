import type { KeyboardEvent } from "react";

export interface TabItem<V extends string> {
  value: V;
  label: string;
}

export interface TabsProps<V extends string> {
  items: readonly TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
}

export function Tabs<V extends string>({ items, value, onChange }: TabsProps<V>) {
  const onKeyDown = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.value === value);
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = items[(i + delta + items.length) % items.length]!;
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] p-1"
    >
      {items.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            data-value={t.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={[
              "flex-1 rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-sm font-medium transition",
              selected
                ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
