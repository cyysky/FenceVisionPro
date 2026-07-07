import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { WizardStepper, WizardStep } from './WizardStepper';

/**
 * Shell for the public AI yard visualizer wizard pages. Provides:
 *   - The Yardex header (logo + tagline, kept consistent across steps)
 *   - The WizardStepper progress indicator
 *   - A Back / Next footer (the Next button is disabled until
 *     `canAdvance` is true; clicking it triggers `onAdvance`)
 *
 * Children render in the middle. Each step page owns its own state
 * and is responsible for clearing / persisting that state on advance.
 */
export function WizardShell({
  steps,
  currentPath,
  children,
  onBack,
  onAdvance,
  canAdvance,
  advancing,
  nextLabel = 'Next',
  backLabel = 'Back',
  backHref,
  advanceHref,
}: {
  steps: WizardStep[];
  currentPath: string;
  children: ReactNode;
  onBack?: () => void;
  onAdvance?: () => void | Promise<void>;
  canAdvance: boolean;
  advancing?: boolean;
  nextLabel?: string;
  backLabel?: string;
  /** When provided, renders Back as a Link (rarely needed - onBack is preferred). */
  backHref?: string;
  /** When provided, the Next button is a Link that just navigates (no submit). */
  advanceHref?: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex flex-col">
      <header className="max-w-4xl mx-auto w-full px-4 py-6 flex items-center gap-3">
        <Link to="/ai-generate" className="w-8 h-8 rounded bg-brand-600 grid place-items-center text-white font-bold">Y</Link>
        <Link to="/ai-generate" className="font-bold text-lg">Yardex AI Yard Visualizer</Link>
        <div className="ml-auto text-xs text-slate-500 italic hidden sm:block">Design To Inspire, Engineered to Endure.</div>
      </header>

      <WizardStepper steps={steps} currentPath={currentPath} />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          {onBack || backHref ? (
            backHref ? (
              <Link
                to={backHref}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
              >
                <span aria-hidden>←</span> {backLabel}
              </Link>
            ) : (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
              >
                <span aria-hidden>←</span> {backLabel}
              </button>
            )
          ) : (
            <Link to="/ai-generate" className="text-sm text-slate-500 hover:text-slate-700">Start over</Link>
          )}

          {advanceHref ? (
            <Link
              to={advanceHref}
              aria-disabled={!canAdvance || advancing}
              onClick={e => { if (!canAdvance || advancing) e.preventDefault(); }}
              className={[
                'inline-flex items-center gap-1.5 px-6 py-2.5 rounded-md font-medium transition',
                canAdvance && !advancing
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed',
              ].join(' ')}
            >
              {nextLabel} <span aria-hidden>→</span>
            </Link>
          ) : (
            <button
              type="button"
              disabled={!canAdvance || advancing}
              onClick={onAdvance}
              className={[
                'inline-flex items-center gap-1.5 px-6 py-2.5 rounded-md font-medium transition',
                canAdvance && !advancing
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed',
              ].join(' ')}
            >
              {advancing ? 'Please wait…' : nextLabel} <span aria-hidden>→</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}