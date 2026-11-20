import type { HTMLAttributes } from "react";

export type PanelVariant = "main" | "inset" | "dark" | "gold";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  selected?: boolean;
}

export function Panel({
  variant = "main",
  selected = false,
  className = "",
  ...rest
}: PanelProps) {
  const base = "rounded-[var(--radius-lg)] border bg-[var(--color-surface)] text-[var(--color-fg)]";
  const variants: Record<PanelVariant, string> = {
    main: "p-4 shadow-sm",
    dark: "p-4 bg-[var(--color-surface-muted)] shadow-sm",
    gold: "p-4 border-amber-300/70 shadow-sm",
    inset: "rounded-[var(--radius-md)] p-3 bg-[var(--color-surface-muted)]",
  };
  const selectedCls = selected
    ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/10"
    : "border-[var(--color-border)]";
  return <div {...rest} className={[base, variants[variant], selectedCls, className].join(" ")} />;
}
