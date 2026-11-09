import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';
import { ToastOutlet } from './Toast';
import { cx } from './cx';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** One line under the title, e.g. "Anonymous. No name attached." */
  description?: ReactNode;
  /** captions: caption background, for the full-screen caption reader. */
  tone?: 'default' | 'captions';
  className?: string;
  children: ReactNode;
}

/**
 * Bottom sheet on phones, right-hand drawer at 900px and wider.
 * Built on <dialog>.showModal(): focus is trapped, the page behind is inert,
 * Escape closes, and focus returns to the opener. Tapping the scrim closes.
 * Put data-autofocus on the control that should get focus first (e.g. the Ask textarea).
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  tone,
  className,
  children,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first control (Close). Move to the field the sheet is for, if marked.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx('ly-sheet', tone === 'captions' && 'ly-sheet--captions', className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        // A click whose target is the <dialog> itself landed on the scrim.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ly-sheet__inner">
        <div className="ly-sheet__head">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        {description && (
          <p id={descId} className="ly-sheet__desc">
            {description}
          </p>
        )}
        {open && children}
      </div>
      {/* Toasts sent while this sheet is open render here: the page behind is inert. */}
      <ToastOutlet />
    </dialog>
  );
}
