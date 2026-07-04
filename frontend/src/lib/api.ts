import axios from 'axios';

const baseURL = (import.meta as any).env?.VITE_API_BASE || '/api';

export const api = axios.create({ baseURL });

export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete api.defaults.headers.common['Authorization'];
}

const TOKEN_KEY = 'fvp_token';
const USER_KEY = 'fvp_user';

export function loadAuth() {
  const t = localStorage.getItem(TOKEN_KEY);
  const u = localStorage.getItem(USER_KEY);
  if (t) setAuthToken(t);
  return { token: t, user: u ? JSON.parse(u) : null };
}

export function saveAuth(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  setAuthToken(token);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  setAuthToken(null);
}

/**
 * Pluck a human-readable error message from an axios error.
 * Handles the various shapes NestJS class-validator returns
 * (string, array of strings, or a ValidationPipe error
 * object) so callers don't need to repeat the same switch.
 */
export function apiErrorMessage(e: any, fallback = 'Something went wrong'): string {
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string') return m;
  if (e?.code === 'ERR_NETWORK') return 'Network error - check your connection';
  if (e?.response?.status === 413) return 'File too large';
  if (e?.response?.status === 429) return 'Too many requests - please wait a moment';
  return fallback;
}

/**
 * Public axios client for routes that don't carry a JWT (the
 * installer and customer public-link pages). No auth
 * interceptor, no token cache - the only "credential" is the
 * unguessable token in the URL.
 */
export const publicApi = axios.create({ baseURL });
