import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

interface ToastMessage {
  id: number;
  text: string;
  icon: IconName;
}

/** The topmost open dialog's outlet, else the page's. */
function pickHost(page: Element | null): Element | null {
  const open = document.querySelectorAll('dialog[open] [data-toast-outlet]');
  return open[open.length - 1] ?? page;
}

type ShowToast = (text: string, opts?: { icon?: IconName; ms?: number }) => void;

const ToastContext = createContext<ShowToast | null>(null);

/**
 * A persistent, empty polite live region that toasts are rendered into.
 * ToastProvider renders one for the page; every Sheet renders one inside its <dialog>.
 * It must exist before the toast text arrives, or screen readers may not announce it.
 */
export function ToastOutlet() {
  return <div className="ly-toast-region" role="status" aria-live="polite" data-toast-outlet="" />;
}

/**
 * One toast at a time, top of the screen, announced politely (role="status").
 * It never takes focus and never holds an action: anything the person must act on
 * belongs in a Sheet or a Banner instead.
 *
 * While a Sheet is open, the page behind it is inert and painted under the modal's top layer,
 * so the toast goes into the topmost open dialog's outlet instead of the page's.
 * The host follows dialogs opening and closing while the toast is up, so a toast never
 * stays inside a closed sheet or under a sheet that opened after it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const pageOutlet = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  const show = useCallback<ShowToast>((text, opts) => {
    clearTimeout(timer.current);
    seq.current += 1;
    const id = seq.current;
    // Pick the outlet after React commits this event's updates, so "close the sheet, then
    // toast" lands on the page and "toast while the sheet stays open" lands in the sheet.
    timer.current = setTimeout(() => {
      setHost(pickHost(pageOutlet.current));
      setToast({ id, text, icon: opts?.icon ?? 'check' });
      timer.current = setTimeout(() => setToast(null), opts?.ms ?? 3500);
    }, 0);
  }, []);

  // While a toast is up, re-pick its host whenever any dialog opens or closes.
  useEffect(() => {
    if (!toast) return;
    const observer = new MutationObserver(() => setHost(pickHost(pageOutlet.current)));
    observer.observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
    return () => observer.disconnect();
  }, [toast]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        ref={pageOutlet}
        className="ly-toast-region"
        role="status"
        aria-live="polite"
        data-toast-outlet=""
      />
      {toast &&
        host?.isConnected &&
        createPortal(
          <div key={toast.id} className="ly-toast">
            <Icon name={toast.icon} />
            {toast.text}
          </div>,
          host,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast needs <ToastProvider> above it');
  return show;
}
