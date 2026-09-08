import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';

const hoisted = vi.hoisted(() => {
  const state: { onErr: ((err: any) => Promise<any>) | null } = { onErr: null };
  const api = {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { headers: { common: {} } },
    interceptors: {
      response: {
        use: (_ok: any, err: any) => { state.onErr = err; return 7; },
        eject: vi.fn(),
      },
    },
  };
  return {
    api, state,
    loadAuth: vi.fn<() => { token: string | null; user: any }>(() => ({ token: null, user: null })),
    saveAuth: vi.fn(),
    clearAuth: vi.fn(),
  };
});

vi.mock('./api', () => ({
  api: hoisted.api,
  publicApi: hoisted.api,
  loadAuth: hoisted.loadAuth,
  saveAuth: hoisted.saveAuth,
  clearAuth: hoisted.clearAuth,
}));

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function makeToken(exp: number): string {
  return `h.${b64url(JSON.stringify({ exp }))}.sig`;
}

const serverUser = { id: 'u1', email: 'a@b.co', fullName: 'A B', role: 'ADMIN', dealerId: null };

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    hoisted.api.get.mockReset();
    hoisted.api.post.mockReset();
    hoisted.api.interceptors.response.eject.mockClear();
    hoisted.loadAuth.mockReset().mockReturnValue({ token: null, user: null });
    hoisted.saveAuth.mockReset();
    hoisted.clearAuth.mockReset();
    hoisted.state.onErr = null;
  });

  it('hydrates from loadAuth and refreshes the user from /auth/me', async () => {
    hoisted.loadAuth.mockReturnValue({ token: 'tok', user: { id: 'old' } });
    hoisted.api.get.mockResolvedValue({ data: serverUser });
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(hoisted.api.get).toHaveBeenCalledWith('/auth/me');
    await waitFor(() => expect(result.current.user).toEqual(serverUser));
    expect(result.current.token).toBe('tok');
  });

  it('drops a token whose exp claim has passed without calling /auth/me', () => {
    const expired = makeToken(Math.floor(Date.now() / 1000) - 10);
    hoisted.loadAuth.mockReturnValue({ token: expired, user: { id: 'old' } });
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(hoisted.clearAuth).toHaveBeenCalled();
    expect(hoisted.api.get).not.toHaveBeenCalled();
  });

  it('clears the session when /auth/me rejects', async () => {
    hoisted.loadAuth.mockReturnValue({ token: 'tok', user: serverUser });
    hoisted.api.get.mockRejectedValue(new Error('401'));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(hoisted.clearAuth).toHaveBeenCalled());
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('bounces the session when any API call returns 401', async () => {
    hoisted.loadAuth.mockReturnValue({ token: 'tok', user: serverUser });
    hoisted.api.get.mockResolvedValue({ data: serverUser });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(serverUser));

    await act(async () => {
      // The real interceptor re-rejects; consume it so the test run
      // doesn't treat the (expected) rejection as unhandled.
      await hoisted.state.onErr!({ response: { status: 401 } }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(hoisted.clearAuth).toHaveBeenCalled();
  });

  it('login stores the token and user; logout clears them', async () => {
    hoisted.api.post.mockResolvedValue({ data: { accessToken: 't2', user: serverUser } });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { await result.current.login('a@b.co', 'pw'); });
    expect(hoisted.api.post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.co', password: 'pw' });
    expect(hoisted.saveAuth).toHaveBeenCalledWith('t2', serverUser);
    expect(result.current.user).toEqual(serverUser);
    expect(result.current.token).toBe('t2');

    act(() => result.current.logout());
    expect(hoisted.clearAuth).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });
});
