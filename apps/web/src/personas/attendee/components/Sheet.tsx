import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Bottom sheet built on <dialog>: focus trap, Escape and backdrop close come for free. */
export function Sheet({ open, onClose, title, description, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // The native `close` event is queued after dialog.close(), so it can arrive after the
  // next sheet opened. Only treat it as a user close while the parent still wants us open.
  const openRef = useRef(open);
  openRef.current = open;
  const titleId = `sheet-${title.replace(/\s+/g, '-').toLowerCase()}`;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      const auto = d.querySelector<HTMLElement>('[data-autofocus]');
      auto?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="at-sheet"
      aria-labelledby={titleId}
      onClose={() => {
        if (openRef.current) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="at-sheet__panel">
        <div className="at-sheet__head">
          <h2 id={titleId} className="at-sheet__title">
            {title}
          </h2>
          <button
            type="button"
            className="at-btn at-btn--sm"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ✕
          </button>
        </div>
        {description && <p className="at-muted">{description}</p>}
        {children}
      </div>
    </dialog>
  );
}
