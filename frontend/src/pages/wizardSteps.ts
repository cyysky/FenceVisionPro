import type { WizardStep } from '../components/WizardStepper';

/**
 * Shared wizard step definitions for the public AI yard visualizer.
 * Used by every step page so the WizardStepper always shows the same
 * 3-step progress bar, regardless of which step the user is on.
 */
export const PUBLIC_AI_WIZARD_STEPS: WizardStep[] = [
  { label: 'Yard',        path: '/ai-generate' },
  { label: 'Photo',       path: '/ai-generate/photo' },
  { label: 'Contact',     path: '/ai-generate/contact' },
];