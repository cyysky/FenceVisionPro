import { useCallback, useEffect, useState } from 'react';

/**
 * Session-scoped state hook backed by sessionStorage. State persists
 * across route changes within the same browser tab but is cleared
 * when the tab closes (vs localStorage which is forever).
 *
 * Use this for the public AI yard visualizer wizard so a user who
 * hits "Next" then "Back" then refreshes doesn't lose their inputs.
 *
 * Backend stores the final state in the PublicLead table once they
 * submit; this hook is only for the in-flight wizard.
 */
export function useSessionState<T>(key: string, initial: T): [T, (next: T) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota or privacy mode - silently fall back to in-memory
    }
  }, [key, value]);

  const clear = useCallback(() => {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    setValue(initial);
  }, [key, initial]);

  return [value, setValue, clear];
}