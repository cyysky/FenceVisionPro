import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, clearAuth, loadAuth, saveAuth } from './api';

interface User { id: string; email: string; fullName: string; role: string; dealerId: string | null; }
interface AuthCtx { user: User | null; token: string | null; login: (email: string, password: string) => Promise<void>; logout: () => void; }

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

/**
 * Decode a JWT payload without verifying the signature. We use this
 * purely to check the `exp` claim client-side; the server still
 * verifies every API call. If the token is expired we drop it
 * before any request goes out.
 */
function readJwtExp(token: string | null): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState(() => {
    const loaded = loadAuth();
    const exp = readJwtExp(loaded.token);
    if (exp && Date.now() / 1000 > exp) {
      // Stale token - clear it so the user is redirected to /login
      clearAuth();
      return { token: null as string | null, user: null as User | null };
    }
    return { token: loaded.token, user: loaded.user };
  });

  // One-time: if a token is present, validate it against the server
  // (catches deactivated users, signature changes, etc). On failure
  // we drop the token and bounce to /login.
  useEffect(() => {
    if (!auth.token) return;
    let cancelled = false;
    api.get('/auth/me')
      .then(r => {
        if (cancelled) return;
        // The server's payload is the source of truth for the user
        setAuth({ token: auth.token, user: r.data as any });
      })
      .catch(() => {
        if (cancelled) return;
        clearAuth();
        setAuth({ token: null, user: null });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also bounce on 401 from any API call - the axios interceptor
  // in api.ts would be ideal but we keep auth.ts self-contained.
  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err?.response?.status === 401 && auth.token) {
          clearAuth();
          setAuth({ token: null, user: null });
        }
        return Promise.reject(err);
      },
    );
    return () => { api.interceptors.response.eject(interceptorId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    saveAuth(data.accessToken, data.user);
    setAuth({ token: data.accessToken, user: data.user });
  }
  function logout() { clearAuth(); setAuth({ token: null, user: null }); }

  return <Ctx.Provider value={{ user: auth.user, token: auth.token, login, logout }}>{children}</Ctx.Provider>;
}
