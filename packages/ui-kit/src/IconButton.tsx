import type { IconName } from '@snake/assets';
import { token } from '@snake/design-tokens';
import { Button, type ButtonProps } from './Button';
import { Icon } from './Icon';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'skinPrefix'> {
  icon: IconName;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  size?: number;
}

/** Square button skinned from `button.icon.*`. */
export function IconButton({ icon, label, size = 44, variant = 'secondary', style, ...rest }: IconButtonProps) {
  return (
    <Button
      {...rest}
      variant={variant}
      skinPrefix="button.icon"
      aria-label={label}
      title={label}
      style={{
        width: size,
        height: size,
        padding: 0,
        display: 'inline-grid',
        placeItems: 'center',
        borderRadius: token('radius.button'),
        ...style,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </Button>
  );
}
