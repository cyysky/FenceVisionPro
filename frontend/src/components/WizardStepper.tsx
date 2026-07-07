import { Link } from 'react-router-dom';

export interface WizardStep {
  /** Short label shown under the dot when active. */
  label: string;
  /** Path that this step lives at - used to mark active/done state. */
  path: string;
}

/**
 * Top progress indicator for the public AI Yard Visualizer wizard.
 * Three dots + connecting lines, with the current step highlighted
 * in brand colour and completed steps shown as filled checkmarks.
 *
 * Steps are passed in the order the user visits them. The active step
 * is matched by `currentPath`; any step before it is "done"; any step
 * after is "pending".
 *
 * Pure presentational - no state, no navigation. The wizard page
 * owns the actual `nav()` calls.
 */
export function WizardStepper({ steps, currentPath }: { steps: WizardStep[]; currentPath: string }) {
  const currentIdx = Math.max(0, steps.findIndex(s => s.path === currentPath));
  return (
    <nav aria-label="Wizard progress" className="max-w-3xl mx-auto px-4 pt-6">
      <ol className="flex items-center justify-center gap-2 sm:gap-4">
        {steps.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          const Circle = (
            <span
              className={[
                'w-8 h-8 rounded-full grid place-items-center text-xs font-semibold border-2 transition',
                done
                  ? 'bg-brand-600 text-white border-brand-600'
                  : active
                    ? 'bg-white text-brand-700 border-brand-600 ring-4 ring-brand-100'
                    : 'bg-white text-slate-400 border-slate-200',
              ].join(' ')}
              aria-current={active ? 'step' : undefined}
            >
              {done ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.296a1 1 0 010 1.408l-7.997 8a1 1 0 01-1.408 0l-3.999-4a1 1 0 011.408-1.408L8 12.591l7.296-7.295a1 1 0 011.408 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                idx + 1
              )}
            </span>
          );

          return (
            <li key={step.path} className="flex items-center gap-2 sm:gap-4">
              {done ? (
                <Link to={step.path} className="block hover:opacity-80 transition" title={`Back to step ${idx + 1}: ${step.label}`}>
                  {Circle}
                </Link>
              ) : (
                Circle
              )}
              <span className={['text-xs sm:text-sm font-medium hidden sm:inline', active ? 'text-slate-900' : 'text-slate-400'].join(' ')}>
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <span
                  className={['h-0.5 w-8 sm:w-16 rounded', idx < currentIdx ? 'bg-brand-600' : 'bg-slate-200'].join(' ')}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className="text-center mt-3 text-xs text-slate-500">
        Step {currentIdx + 1} of {steps.length}
      </div>
    </nav>
  );
}