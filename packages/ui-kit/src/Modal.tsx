import { getNineSlice } from '@snake/assets';
import { token } from '@snake/design-tokens';
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';
import { ensureKeyframes } from './motion';
import { nineSliceStyle } from './skin';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Close on backdrop click and Escape. Default true. */
  dismissible?: boolean;
  width?: number;
}

/** Centered dialog framed by `modal.frame.normal`, popping in with `motion.pop`. */
export function Modal({ open, onClose, title, children, dismissible = true, width = 360 }: ModalProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(ensureKeyframes, []);
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prevFocus?.focus();
    };
  }, [open, dismissible, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const frame: CSSProperties = nineSliceStyle({ normal: getNineSlice('modal.frame.normal') }, 'normal') ?? {
    background: token('color.surface'),
    border: `${token('border.width')} solid ${token('color.border')}`,
    borderRadius: token('radius.panel'),
    boxShadow: token('shadow.panel'),
  };

  return createPortal(
    <div
      data-motion
      onPointerDown={(e) => dismissible && e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'grid',
        placeItems: 'center',
        padding: token('space.lg'),
        background: token('color.overlay'),
        animation: `snake-fade ${token('motion.pop.duration')} ease-out`,
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        data-motion
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: width,
          boxSizing: 'border-box',
          padding: token('space.lg'),
          color: token('color.text'),
          fontFamily: token('font.body'),
          outline: 'none',
          animation: `snake-pop ${token('motion.pop.duration')} ${token('motion.pop.easing')}`,
          ...frame,
        }}
      >
        {dismissible && (
          <IconButton icon="icon.close" label="Close" size={36} onClick={onClose} style={{ position: 'absolute', top: 8, right: 8 }} />
        )}
        {title && (
          <h2 id={titleId} style={{ margin: `0 0 ${token('space.md')}`, fontFamily: token('font.display'), fontSize: token('font.sizeLg') }}>
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
