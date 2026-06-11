import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useState-compatible hook that persists value to sessionStorage so the state
 * survives tab-switches and full page reloads within the same browser tab.
 *
 * - Same API as useState (returns [value, setValue])
 * - Per-tab scope (sessionStorage) — closing the tab clears it
 * - SSR-safe (falls back to initialValue on server)
 */
export function useSessionStorageState<T>(
  key: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const initialRef = useRef(initialValue);

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialRef.current;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) return initialRef.current;
      return JSON.parse(raw) as T;
    } catch {
      return initialRef.current;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded or serialization failure — silently ignore
    }
  }, [key, value]);

  const setter: React.Dispatch<React.SetStateAction<T>> = useCallback((next) => setValue(next), []);

  return [value, setter];
}
