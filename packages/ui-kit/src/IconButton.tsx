import type { IconName } from "./Icon";
import { Button, type ButtonProps } from "./Button";
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
      className={`p-0 ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </Button>
  );
}
