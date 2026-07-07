import { useNavigate } from 'react-router-dom';
import { useSessionState } from '../lib/useSessionState';
import { PublicPhotoInput, PublicPhotoValue } from '../components/PublicPhotoInput';
import { PublicYardSide } from '../components/PublicYardSelector';
import { WizardShell } from '../components/WizardShell';
import { PUBLIC_AI_WIZARD_STEPS } from './wizardSteps';

/**
 * Step 2 of the public AI yard visualizer wizard.
 * User either uploads their own photo or picks one from the curated
 * gallery of 9 + 9 AI-generated house exteriors.
 *
 * Validates that yardSide was set in step 1 - if not, redirects
 * back. (UX defence against deep-linking straight to step 2.)
 */
export default function PublicAiStepPhoto() {
  const nav = useNavigate();
  const [yardSide] = useSessionState<PublicYardSide | null>('ai-wizard.yardSide', null);
  const [photo, setPhoto] = useSessionState<PublicPhotoValue | null>('ai-wizard.photo', null);

  if (!yardSide) {
    // No yard picked yet - send them to step 1.
    setTimeout(() => nav('/ai-generate', { replace: true }), 0);
    return null;
  }

  function advance() {
    if (!photo) return;
    nav('/ai-generate/contact');
  }

  return (
    <WizardShell
      steps={PUBLIC_AI_WIZARD_STEPS}
      currentPath="/ai-generate/photo"
      onBack={() => nav('/ai-generate')}
      canAdvance={Boolean(photo)}
      onAdvance={advance}
      nextLabel="Next: your details"
    >
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
        Add a photo of your {yardSide === 'FRONT' ? 'front' : 'back'} yard
      </h1>
      <p className="text-sm text-slate-600 mb-6">
        Upload a real photo so the AI can render a fence onto your actual home, or
        pick one of our curated examples to preview a typical {yardSide === 'FRONT' ? 'front' : 'back'}-yard setup.
      </p>
      <PublicPhotoInput
        value={photo}
        onChange={setPhoto}
        yardSide={yardSide}
      />
    </WizardShell>
  );
}