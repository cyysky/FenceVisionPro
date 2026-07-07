import { useNavigate } from 'react-router-dom';
import { useSessionState } from '../lib/useSessionState';
import { PublicYardSelector, PublicYardSide } from '../components/PublicYardSelector';
import { WizardShell } from '../components/WizardShell';
import { PUBLIC_AI_WIZARD_STEPS } from './wizardSteps';

/**
 * Step 1 of the public AI yard visualizer wizard.
 * User picks FRONT or BACK yard. Backed by sessionStorage so the
 * choice survives page refreshes.
 */
export default function PublicAiStepYard() {
  const nav = useNavigate();
  const [yardSide, setYardSide] = useSessionState<PublicYardSide | null>('ai-wizard.yardSide', null);

  function advance() {
    if (!yardSide) return;
    nav('/ai-generate/photo');
  }

  return (
    <WizardShell
      steps={PUBLIC_AI_WIZARD_STEPS}
      currentPath="/ai-generate"
      canAdvance={Boolean(yardSide)}
      onAdvance={advance}
      nextLabel="Next: choose photo"
    >
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Which yard are we designing?</h1>
      <p className="text-sm text-slate-600 mb-6">
        Pick the side of your property you'd like to see with a new fence.
        We'll suggest the right style based on the view.
      </p>
      <PublicYardSelector value={yardSide} onChange={setYardSide} />
    </WizardShell>
  );
}