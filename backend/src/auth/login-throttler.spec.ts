/**
 * Tests for the in-process login rate limiter. We don't try to
 * exhaust the time budget in the test - we just verify the
 * counter increments and trips the block.
 */
import { checkLoginAllowed, recordLoginFailure, clearLoginFailures } from './login-throttler';

describe('login-throttler', () => {
  beforeEach(() => clearLoginFailures('1.1.1.1'));

  it('allows initial attempts', () => {
    expect(checkLoginAllowed('1.1.1.1')).toEqual({ ok: true });
  });

  it('blocks after MAX_FAILS failures', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure('1.1.1.1');
    const r = checkLoginAllowed('1.1.1.1');
    expect(r.ok).toBe(false);
    // Cast to access the discriminated union's blocked branch
    expect((r as { ok: false; retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0);
  });

  it('clears the counter on success', () => {
    for (let i = 0; i < 9; i++) recordLoginFailure('1.1.1.1');
    clearLoginFailures('1.1.1.1');
    expect(checkLoginAllowed('1.1.1.1')).toEqual({ ok: true });
  });

  it('isolates counters per IP', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure('1.1.1.1');
    expect(checkLoginAllowed('1.1.1.1').ok).toBe(false);
    expect(checkLoginAllowed('2.2.2.2').ok).toBe(true);
  });
});
