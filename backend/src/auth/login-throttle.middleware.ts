import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { checkLoginAllowed, recordLoginFailure, clearLoginFailures } from './login-throttler';

/**
 * Login throttle middleware. Runs BEFORE the body validation
 * pipe, so we throttle on raw connection attempts (not just on
 * well-formed login requests). Without this, an attacker
 * spraying 1000 bad payloads per second from one IP would
 * never trip the throttler because @IsEmail would reject
 * each one before the controller ran.
 *
 * The middleware delegates to login-throttler.ts which holds
 * the per-IP counter.
 */
@Injectable()
export class LoginThrottleMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoginThrottleMiddleware.name);
  use(req: Request, res: Response, next: NextFunction) {
    const xff = (req.headers['x-forwarded-for'] || '').toString();
    const ip = (xff ? xff.split(',')[0].trim() : (req.ip || req.socket?.remoteAddress || 'unknown'));
    const allowed = checkLoginAllowed(ip);
    if (!allowed.ok) {
      res.setHeader('Retry-After', String((allowed as { ok: false; retryAfterSec: number }).retryAfterSec));
      throw new HttpException(
        `Too many login attempts. Try again in ${(allowed as { ok: false; retryAfterSec: number }).retryAfterSec}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Stash a callback so the controller can record failures /
    // clear on success. We don't try to monkey-patch the response
    // because the controller already records failures and we can
    // hook into that.
    (req as any).__loginThrottle = { ip };
    next();
  }
}

/** Helper used by AuthController to wire up the success/fail hooks. */
export function recordFailureFromReq(req: any) {
  const ctx = req?.__loginThrottle;
  if (ctx?.ip) recordLoginFailure(ctx.ip);
}
export function clearFromReq(req: any) {
  const ctx = req?.__loginThrottle;
  if (ctx?.ip) clearLoginFailures(ctx.ip);
}
