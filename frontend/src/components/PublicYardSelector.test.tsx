import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicYardSelector } from './PublicYardSelector';

describe('PublicYardSelector', () => {
  it('renders both yard cards unselected', () => {
    render(<PublicYardSelector value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Front Yard/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Back Yard/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the selected yard as pressed', () => {
    render(<PublicYardSelector value="BACK" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Back Yard/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Front Yard/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the clicked yard side', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PublicYardSelector value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Front Yard/i }));
    expect(onChange).toHaveBeenCalledWith('FRONT');
    await user.click(screen.getByRole('button', { name: /Back Yard/i }));
    expect(onChange).toHaveBeenLastCalledWith('BACK');
  });
});
