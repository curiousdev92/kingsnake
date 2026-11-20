import type { ReactNode } from "react";

export interface BadgeProps {
  count?: number | boolean;
  max?: number;
  children: ReactNode;
}

export function Badge({ count, max = 99, children }: BadgeProps) {
  const visible = count === true || (typeof count === "number" && count > 0);
  const text = typeof count === "number" ? (count > max ? `${max}+` : String(count)) : "";
  return (
    <span className="relative inline-block">
      {children}
      {visible && (
        <span
          aria-label={text ? `${text} new` : "new"}
          className="pointer-events-none absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-[var(--color-accent)] px-1 text-[11px] leading-none text-[var(--color-accent-fg)]"
        >
          {text}
        </span>
      )}
    </span>
  );
}
