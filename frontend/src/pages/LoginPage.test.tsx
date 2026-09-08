import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';

const authMock = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  user: null as { id: string; email: string; fullName: string; role: string; dealerId: string | null } | null,
  token: null as string | null,
}));
const navMock = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => ({ state: null as any }));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    login: authMock.login,
    logout: authMock.logout,
    user: authMock.user,
    token: authMock.token,
  }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navMock,
  useLocation: () => locationMock,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    authMock.login.mockReset();
    authMock.login.mockResolvedValue(undefined);
    authMock.user = null;
    authMock.token = null;
    navMock.mockReset();
    locationMock.state = null;
  });

  it('rejects an invalid email before calling the API', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address');
    expect(authMock.login).not.toHaveBeenCalled();
  });

  it('rejects short passwords', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'owner@yardex.local');
    await user.type(screen.getByLabelText('Password'), '123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 6 characters');
    expect(authMock.login).not.toHaveBeenCalled();
  });

  it('logs in and navigates to the default route', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'admin@yardex.local');
    await user.type(screen.getByLabelText('Password'), 'admin1234');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(authMock.login).toHaveBeenCalledWith('admin@yardex.local', 'admin1234');
    expect(navMock).toHaveBeenCalledWith('/quotes', { replace: true });
  });

  it('navigates to the location state after login', async () => {
    locationMock.state = { from: '/projects' };
    authMock.login.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(navMock).toHaveBeenCalledWith('/projects', { replace: true });
  });

  it('shows the API error message when login fails', async () => {
    authMock.login.mockRejectedValue({ response: { data: { message: ['Bad credentials'] } } });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad credentials');
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('fills in the demo account on click', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'owner@yardex.local' }));
    expect(screen.getByLabelText('Email')).toHaveValue('owner@yardex.local');
    expect(screen.getByLabelText('Password')).toHaveValue('owner1234');
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('bounces an already-authenticated user to /quotes', () => {
    authMock.token = 'tok';
    authMock.user = { id: 'u1', email: 'a@b.co', fullName: 'A', role: 'ADMIN', dealerId: null };
    render(<LoginPage />);
    expect(navMock).toHaveBeenCalledWith('/quotes', { replace: true });
  });
});
