import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface ToastItem {
  id: number;
  text: string;
}
interface Ctx {
  toast: (text: string, ms?: number) => void;
}

const ToastContext = createContext<Ctx>({ toast: () => undefined });

/** Polite toasts: announced by screen readers, never take focus, no actions inside. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const toast = useCallback((text: string, ms = 4_000) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-2), { id, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), ms);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="at-toasts" role="status" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className="at-toast">
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx['toast'] {
  return useContext(ToastContext).toast;
}
