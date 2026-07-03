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
