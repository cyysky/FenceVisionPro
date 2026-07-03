import { ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmOpts {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

let confirmFn: ((opts: ConfirmOpts) => Promise<boolean>) | null = null;

/**
 * Imperative confirm dialog. Used as a replacement for
 * `window.confirm()` so the prompts match the rest of the
 * app's styling. Returns a promise that resolves to true
 * if confirmed, false if cancelled.
 */
export function confirm(opts: ConfirmOpts): Promise<boolean> {
  if (!confirmFn) {
    // eslint-disable-next-line no-console
    console.warn('ConfirmDialog not mounted; falling back to window.confirm');
    return Promise.resolve(window.confirm(`${opts.title}\n\n${opts.message}`));
  }
  return confirmFn(opts);
}

export function ConfirmDialog() {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  confirmFn = (o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>(res => setResolver(() => res));
  };

  function close(result: boolean) {
    resolver?.(result);
    setOpts(null); setResolver(null);
  }

  if (!opts) return null;

  const variant = opts.variant || 'default';
  const confirmCls = variant === 'danger'
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-brand-600 text-white hover:bg-brand-700';

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/40 grid place-items-center p-4 animate-[fadeIn_0.15s_ease-out]"
         onClick={() => close(false)} role="dialog" aria-modal="true">
      <div className="bg-white border rounded-xl p-5 w-full max-w-sm shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-base">{opts.title}</h3>
        <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{opts.message}</p>
        <div className="mt-4 flex gap-2 justify-end">
          <button onClick={() => close(false)} className="px-3 py-1.5 border rounded text-sm">
            {opts.cancelLabel || 'Cancel'}
          </button>
          <button onClick={() => close(true)} className={`px-3 py-1.5 rounded text-sm ${confirmCls}`}>
            {opts.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
