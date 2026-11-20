import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={["ui-btn-3d", variant, className].filter(Boolean).join(" ")}
    >
      <span className="ui-btn-3d-front">{children}</span>
    </button>
  );
}
