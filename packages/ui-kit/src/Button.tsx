import type { ButtonState } from '@snake/assets';
import { token } from '@snake/design-tokens';
import { useState, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { nineSliceStyle, resolveSkin, type Skin } from './skin';

export type { ButtonState } from '@snake/assets';
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const STATES: readonly ButtonState[] = ['normal', 'pressed', 'disabled'];

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 9-slice art per state. Defaults to the manifest's `button.<variant>.*`; without art it renders from tokens. */
  skin?: Skin<ButtonState>;
  /** Manifest prefix to look up art under. IconButton uses `button.icon`. */
  skinPrefix?: string;
}

const fallback: Record<ButtonVariant, CSSProperties> = {
  primary: { background: token('color.accent'), color: token('color.textOnAccent') },
  secondary: { background: token('color.surface'), color: token('color.text') },
  danger: { background: token('color.danger'), color: token('color.textOnDanger') },
};

export function Button({
  variant = 'primary',
  skin,
  skinPrefix,
  disabled,
  style,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  ...rest
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const state: ButtonState = disabled ? 'disabled' : pressed ? 'pressed' : 'normal';

  const base: CSSProperties = {
    fontFamily: token('font.display'),
    fontSize: token('font.sizeMd'),
    padding: `${token('space.sm')} ${token('space.lg')}`,
    cursor: disabled ? 'default' : 'pointer',
    userSelect: 'none',
    transform: pressed ? `scale(${token('motion.press.scale')})` : undefined,
    transition: `transform ${token('motion.press.duration')} ${token('motion.press.easing')}`,
  };
  const skinned = nineSliceStyle(resolveSkin(skin, skinPrefix ?? `button.${variant}`, STATES), state);
  const look: CSSProperties = skinned ?? {
    ...fallback[variant],
    border: `${token('border.width')} solid ${token('color.border')}`,
    borderRadius: token('radius.button'),
    boxShadow: token('shadow.button'),
    ...(disabled && { background: token('color.disabled'), color: token('color.textDisabled'), borderColor: token('color.textDisabled') }),
  };

  return (
    <button
      {...rest}
      disabled={disabled}
      data-state={state}
      style={{ ...base, ...look, ...(skinned && disabled ? { color: token('color.textDisabled') } : null), ...style }}
      onPointerDown={(e) => {
        setPressed(true);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        setPressed(false);
        onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        setPressed(false);
        onPointerLeave?.(e);
      }}
    />
  );
}
