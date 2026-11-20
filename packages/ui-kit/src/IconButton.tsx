import { Button, type ButtonProps } from "./Button";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";

export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  icon: IconName;
  label: string;
  size?: number;
}

export function IconButton({
  icon,
  label,
  size = 40,
  variant = "secondary",
  className = "",
  style,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      {...rest}
      variant={variant}
      aria-label={label}
      title={label}
      className={`[&_.ui-btn-3d-front]:p-0 [&_.ui-btn-3d-front]:w-full [&_.ui-btn-3d-front]:h-full ${className}`}
      style={{ ...style }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </Button>
  );
}
