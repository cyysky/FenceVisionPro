import { join, normalize, sep } from 'path';

/**
 * Resolve a `/static/...` URL into an absolute path inside `dataDir`
 * and refuse to escape. Without this a malicious caller could pass
 * `floorPlanUrl: '/static/../../etc/passwd'` and have sharp read
 * arbitrary files.
 */
export function resolveSafe(dataDir: string, staticUrl: string): string {
  if (typeof staticUrl !== 'string' || !staticUrl.startsWith('/static/')) {
    throw new Error('expected /static/... path');
  }
  const rel = staticUrl.replace(/^\/static\//, '');
  const abs = normalize(join(dataDir, rel));
  const root = normalize(dataDir) + sep;
  if (abs !== normalize(dataDir) && !abs.startsWith(root)) {
    throw new Error('path escapes data dir');
  }
  return abs;
}
