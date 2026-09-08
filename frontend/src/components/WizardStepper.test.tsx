import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WizardStepper, type WizardStep } from './WizardStepper';

const steps: WizardStep[] = [
  { label: 'Yard', path: '/ai-generate' },
  { label: 'Photo', path: '/ai-generate/photo' },
  { label: 'Contact', path: '/ai-generate/contact' },
];

describe('WizardStepper', () => {
  it('marks the current step and labels the progress', () => {
    render(
      <MemoryRouter>
        <WizardStepper steps={steps} currentPath="/ai-generate/photo" />
      </MemoryRouter>,
    );
    const current = screen.getByLabelText('Wizard progress').querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent('2');
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });

  it('turns completed steps into back-links', () => {
    render(
      <MemoryRouter>
        <WizardStepper steps={steps} currentPath="/ai-generate/contact" />
      </MemoryRouter>,
    );
    expect(screen.getByTitle('Back to step 1: Yard')).toHaveAttribute('href', '/ai-generate');
    expect(screen.getByTitle('Back to step 2: Photo')).toHaveAttribute('href', '/ai-generate/photo');
  });

  it('falls back to step 1 when the current path is unknown', () => {
    render(
      <MemoryRouter>
        <WizardStepper steps={steps} currentPath="/nope" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });
});
