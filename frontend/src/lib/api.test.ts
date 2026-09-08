import { describe, it, expect } from 'vitest';
import { api, apiErrorMessage, clearAuth, loadAuth, saveAuth, setAuthToken } from './api';

describe('apiErrorMessage', () => {
  it('joins array messages from class-validator', () => {
    const err = { response: { data: { message: ['email must be an email', 'name too short'] } } };
    expect(apiErrorMessage(err)).toBe('email must be an email, name too short');
  });

  it('passes through string messages', () => {
    const err = { response: { data: { message: 'Unauthorized' } } };
    expect(apiErrorMessage(err)).toBe('Unauthorized');
  });

  it('handles network errors', () => {
    expect(apiErrorMessage({ code: 'ERR_NETWORK' })).toBe('Network error - check your connection');
  });

  it('handles 413 and 429 status codes', () => {
    expect(apiErrorMessage({ response: { status: 413 } })).toBe('File too large');
    expect(apiErrorMessage({ response: { status: 429 } })).toBe('Too many requests - please wait a moment');
  });

  it('falls back to the supplied default', () => {
    expect(apiErrorMessage(null)).toBe('Something went wrong');
    expect(apiErrorMessage({ nope: true }, 'custom fallback')).toBe('custom fallback');
  });
});

describe('auth token helpers', () => {
  it('writes and reads the Authorization header', () => {
    setAuthToken('tok123');
    expect(api.defaults.headers.common.Authorization).toBe('Bearer tok123');
  });

  it('removes the Authorization header when cleared', () => {
    setAuthToken('tok123');
    setAuthToken(null);
    expect(api.defaults.headers.common.Authorization).toBeUndefined();
  });

  it('saveAuth / loadAuth round-trips token and user through localStorage', () => {
    const user = { id: 'u1', email: 'a@b.co', fullName: 'A B', role: 'ADMIN', dealerId: null };
    saveAuth('tok123', user);
    const loaded = loadAuth();
    expect(loaded.token).toBe('tok123');
    expect(loaded.user).toEqual(user);
    expect(api.defaults.headers.common.Authorization).toBe('Bearer tok123');
  });

  it('clearAuth removes stored credentials and the header', () => {
    saveAuth('tok123', { id: 'u1' });
    clearAuth();
    expect(loadAuth()).toEqual({ token: null, user: null });
    expect(api.defaults.headers.common.Authorization).toBeUndefined();
  });

  it('loadAuth returns nulls when nothing was saved', () => {
    expect(loadAuth()).toEqual({ token: null, user: null });
  });
});
