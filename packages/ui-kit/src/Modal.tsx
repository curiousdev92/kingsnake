import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./IconButton";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
  width?: number;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  width = 420,
}: ModalProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, dismissible, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-[ui-fade_120ms_ease-out]"
      onPointerDown={(e) => dismissible && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="relative w-full max-h-[85vh] overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-fg)] shadow-xl outline-none animate-[ui-pop_140ms_ease-out]"
        style={{ maxWidth: width }}
      >
        {dismissible && (
          <IconButton
            icon="icon.close"
            label="Close"
            size={32}
            onClick={onClose}
            className="absolute right-3 top-3"
          />
        )}
        {title && (
          <h2 id={titleId} className="m-0 mb-3 pr-10 text-lg ">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
