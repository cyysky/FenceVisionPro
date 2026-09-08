import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesignsPage from './DesignsPage';

const getMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), push: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: { get: getMock } }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => toastMock }));

const designs = [
  { id: 'd1', name: 'Cape Picket', style: 'Picket', overlayUrl: '/static/designs/d1.png', description: 'Classic' },
  { id: 'd2', name: 'Total Privacy', style: 'Privacy', overlayUrl: null, description: 'Tall boards' },
];

function renderPage() {
  render(
    <MemoryRouter>
      <DesignsPage />
    </MemoryRouter>,
  );
}

describe('DesignsPage', () => {
  beforeEach(() => {
    getMock.mockReset();
    toastMock.error.mockReset();
  });

  it('loads and lists designs, then filters by search and style', async () => {
    getMock.mockResolvedValue({ data: designs });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Cape Picket')).toBeInTheDocument();
    expect(screen.getByText('Total Privacy')).toBeInTheDocument();
    expect(screen.getByText('(2 of 2)')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search designs'), 'privacy');
    expect(screen.queryByText('Cape Picket')).not.toBeInTheDocument();
    expect(screen.getByText('Total Privacy')).toBeInTheDocument();
    expect(screen.getByText('(1 of 2)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Picket' }));
    expect(screen.getByText('(0 of 2)')).toBeInTheDocument();
    expect(screen.getByText('No designs match the filter.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByText('Cape Picket')).toBeInTheDocument();
    expect(screen.getByText('Total Privacy')).toBeInTheDocument();
  });

  it('shows the empty state when the library has no entries', async () => {
    getMock.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText('No designs in the library yet.')).toBeInTheDocument();
    expect(screen.getByText('(0 of 0)')).toBeInTheDocument();
  });

  it('shows a toast and empty list when the API fails', async () => {
    getMock.mockRejectedValue(new Error('down'));
    renderPage();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Failed to load designs'));
    expect(await screen.findByText('No designs in the library yet.')).toBeInTheDocument();
  });
});
