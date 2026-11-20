import type { HTMLAttributes } from "react";

export type ChipVariant = "default" | "gold" | "gem";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
}

export function Chip({ variant = "default", className = "", ...rest }: ChipProps) {
  const variants: Record<ChipVariant, string> = {
    default: "bg-[var(--color-surface-muted)] border-[var(--color-border)]",
    gold: "bg-amber-50 border-amber-200 text-amber-900",
    gem: "bg-sky-50 border-sky-200 text-sky-900",
  };
  return (
    <span
      {...rest}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--color-fg)]",
        variants[variant],
        className,
      ].join(" ")}
    />
  );
}
