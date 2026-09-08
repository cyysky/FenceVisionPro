import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';

const authMock = vi.hoisted(() => ({
  demoLogin: vi.fn(),
  logout: vi.fn(),
  user: null as { id: string; email: string; fullName: string; role: string; dealerId: string | null } | null,
  token: null as string | null,
}));
const navMock = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => ({ state: null as any }));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    demoLogin: authMock.demoLogin,
    logout: authMock.logout,
    user: authMock.user,
    token: authMock.token,
  }),
}));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode; [k: string]: any }) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>{children}</a>
  ),
  useNavigate: () => navMock,
  useLocation: () => locationMock,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    authMock.demoLogin.mockReset();
    authMock.demoLogin.mockResolvedValue(undefined);
    authMock.user = null;
    authMock.token = null;
    navMock.mockReset();
    locationMock.state = null;
  });

  it('links back to the Yardex home page', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: 'Y' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '← Back to Yardex home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Yardex' })).toHaveAttribute('href', '/');
  });

  it('has no password field', () => {
    render(<LoginPage />);
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('signs into the owner demo account without a password', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /owner@yardex\.local/i }));
    expect(authMock.demoLogin).toHaveBeenCalledWith('owner@yardex.local');
    expect(navMock).toHaveBeenCalledWith('/quotes', { replace: true });
  });

  it('signs into the admin demo account without a password', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /admin@yardex\.local/i }));
    expect(authMock.demoLogin).toHaveBeenCalledWith('admin@yardex.local');
    expect(navMock).toHaveBeenCalledWith('/quotes', { replace: true });
  });

  it('navigates to the location state after demo login', async () => {
    locationMock.state = { from: '/projects' };
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /owner@yardex\.local/i }));
    expect(navMock).toHaveBeenCalledWith('/projects', { replace: true });
  });

  it('shows the API error message when demo login fails', async () => {
    authMock.demoLogin.mockRejectedValue({ response: { data: { message: ['Invalid demo account'] } } });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /owner@yardex\.local/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid demo account');
  });

  it('bounces an already-authenticated user to /quotes', () => {
    authMock.token = 'tok';
    authMock.user = { id: 'u1', email: 'a@b.co', fullName: 'A', role: 'ADMIN', dealerId: null };
    render(<LoginPage />);
    expect(navMock).toHaveBeenCalledWith('/quotes', { replace: true });
  });
});
