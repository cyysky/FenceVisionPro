/**
 * LoginThrottleMiddleware unit tests. The middleware runs before
 * validation, so every raw connection attempt is counted. This suite
 * verifies IP extraction, the 429 response, and the req hooks the
 * controller uses to record success/failure.
 */
import { HttpException } from '@nestjs/common';
import { LoginThrottleMiddleware, recordFailureFromReq, clearFromReq } from './login-throttle.middleware';
import { clearLoginFailures, checkLoginAllowed, recordLoginFailure } from './login-throttler';

describe('LoginThrottleMiddleware', () => {
  let mw: LoginThrottleMiddleware;

  beforeEach(() => {
    mw = new LoginThrottleMiddleware();
    clearLoginFailures('9.9.9.9');
  });

  function run(req: any): { next: jest.Mock; res: any; err: any } {
    const res = { setHeader: jest.fn(), statusCode: 200 };
    const next = jest.fn();
    let err: any;
    try {
      mw.use(req, res as any, next);
    } catch (e) {
      err = e;
    }
    return { next, res, err };
  }

  it('uses the first x-forwarded-for IP when present', () => {
    const req = { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, ip: '127.0.0.1' };
    const { next, err, res } = run(req);
    expect(err).toBeUndefined();
    expect(next).toHaveBeenCalled();
    expect((req as any).__loginThrottle).toEqual({ ip: '1.2.3.4' });
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('falls back to req.ip then socket.remoteAddress then unknown', () => {
    const r1 = { headers: {}, ip: '5.5.5.5' };
    run(r1);
    expect((r1 as any).__loginThrottle.ip).toBe('5.5.5.5');

    const r2 = { headers: {}, socket: { remoteAddress: '6.6.6.6' } };
    run(r2);
    expect((r2 as any).__loginThrottle.ip).toBe('6.6.6.6');

    const r3 = { headers: {} };
    run(r3);
    expect((r3 as any).__loginThrottle.ip).toBe('unknown');
  });

  it('throws 429 with Retry-After once the IP is blocked', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure('9.9.9.9');
    const req = { headers: { 'x-forwarded-for': '9.9.9.9' } };
    const { err, res, next } = run(req);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a fresh IP and after the window expires', () => {
    expect(checkLoginAllowed('8.8.8.8').ok).toBe(true);
  });
});

describe('login throttle req hooks', () => {
  it('recordFailureFromReq does nothing without a throttle context', () => {
    expect(() => recordFailureFromReq({})).not.toThrow();
    expect(() => recordFailureFromReq(undefined)).not.toThrow();
    expect(() => clearFromReq({})).not.toThrow();
    expect(() => clearFromReq(undefined)).not.toThrow();
  });

  it('recordFailureFromReq increments the recorded IP', () => {
    clearLoginFailures('7.7.7.7');
    recordFailureFromReq({ __loginThrottle: { ip: '7.7.7.7' } });
    // 9 more failures -> blocked
    for (let i = 0; i < 9; i++) recordLoginFailure('7.7.7.7');
    expect(checkLoginAllowed('7.7.7.7').ok).toBe(false);
  });

  it('clearFromReq resets the counter so the user is not stuck', () => {
    clearLoginFailures('6.6.6.6');
    for (let i = 0; i < 10; i++) recordLoginFailure('6.6.6.6');
    expect(checkLoginAllowed('6.6.6.6').ok).toBe(false);
    clearFromReq({ __loginThrottle: { ip: '6.6.6.6' } });
    expect(checkLoginAllowed('6.6.6.6').ok).toBe(true);
  });
});
