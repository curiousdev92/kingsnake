import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:brightness-110 active:brightness-95",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-fg)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)]",
  danger:
    "bg-[var(--color-danger)] text-[var(--color-danger-fg)] hover:brightness-110 active:brightness-95",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
