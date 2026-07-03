import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; kind: ToastKind; message: string; }
interface Ctx { push: (kind: ToastKind, message: string) => void; success: (m: string) => void; error: (m: string) => void; info: (m: string) => void; warning: (m: string) => void; }

const ToastCtx = createContext<Ctx>(null as any);
export const useToast = () => useContext(ToastCtx);

const COLORS: Record<ToastKind, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-800 text-white',
  warning: 'bg-amber-500 text-white',
};

const ICONS: Record<ToastKind, string> = {
  success: '✓', error: '✕', info: 'ℹ', warning: '⚠',
};

/**
 * Lightweight global toast/notification system. Self-contained,
 * no external deps. Toasts auto-dismiss after 4s; the user can
 * also click to dismiss earlier. Multiple toasts stack
 * vertically; the most recent is at the bottom.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: number) => setToasts(t => t.filter(x => x.id !== id));

  const value: Ctx = {
    push,
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
    warning: (m) => push('warning', m),
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            onClick={() => dismiss(t.id)}
            className={`${COLORS[t.kind]} px-4 py-2.5 rounded shadow-lg max-w-sm text-sm font-medium pointer-events-auto cursor-pointer animate-[slideIn_0.2s_ease-out]`}
          >
            <span className="mr-2">{ICONS[t.kind]}</span>{t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
