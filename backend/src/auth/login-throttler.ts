/**
 * Minimal in-process login rate limiter. The point isn't to defeat a
 * determined attacker (a real deployment would use Redis or a WAF),
 * but to slow down trivial brute-force attempts on /auth/login.
 *
 * Rule: at most 10 attempts per IP per minute. After 10 the IP is
 * blocked for 60 seconds. Successful logins clear the counter for
 * the IP. We do NOT block the JWT-protected endpoints, only
 * /auth/login - we want a typo to not lock the user out for an
 * hour, but a credential-stuffing run to be slowed.
 */

interface Counter { fails: number; blockedUntil: number; lastReset: number; }
const counters = new Map<string, Counter>();

// Cap memory: at most 10k IPs in the map. Trim every 5 minutes.
const MAX_KEYS = 10_000;
setInterval(() => {
  if (counters.size <= MAX_KEYS) return;
  const now = Date.now();
  // Drop oldest-reset entries
  for (const [k, v] of counters) {
    if (now - v.lastReset > 5 * 60_000) counters.delete(k);
    if (counters.size <= MAX_KEYS * 0.8) break;
  }
}, 5 * 60_000).unref?.();

const WINDOW_MS = 60_000;
const MAX_FAILS = 10;
const BLOCK_MS = 60_000;

export function checkLoginAllowed(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const c = counters.get(ip) || { fails: 0, blockedUntil: 0, lastReset: now };
  if (c.blockedUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((c.blockedUntil - now) / 1000) };
  }
  if (now - c.lastReset > WINDOW_MS) {
    // Window expired - reset.
    c.fails = 0;
    c.lastReset = now;
  }
  counters.set(ip, c);
  return { ok: true };
}

export function recordLoginFailure(ip: string) {
  const c = counters.get(ip) || { fails: 0, blockedUntil: 0, lastReset: Date.now() };
  c.fails += 1;
  if (c.fails >= MAX_FAILS) {
    c.blockedUntil = Date.now() + BLOCK_MS;
  }
  counters.set(ip, c);
}

export function clearLoginFailures(ip: string) {
  counters.delete(ip);
}
