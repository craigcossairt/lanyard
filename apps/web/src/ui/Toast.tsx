import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';

interface ToastMessage {
  id: number;
  text: string;
  icon: IconName;
}

type ShowToast = (text: string, opts?: { icon?: IconName; ms?: number }) => void;

const ToastContext = createContext<ShowToast | null>(null);

/**
 * One toast at a time, top of the screen, announced politely (role="status").
 * It never takes focus and never holds an action: anything the person must act on
 * belongs in a Sheet or a Banner instead.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  const show = useCallback<ShowToast>((text, opts) => {
    clearTimeout(timer.current);
    seq.current += 1;
    setToast({ id: seq.current, text, icon: opts?.icon ?? 'check' });
    timer.current = setTimeout(() => setToast(null), opts?.ms ?? 3500);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="ly-toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="ly-toast">
            <Icon name={toast.icon} />
            {toast.text}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast needs <ToastProvider> above it');
  return show;
}
