/**
 * useDebounce — returns a debounced copy of `value`, updated `delayMs` after
 * the last change settles.
 *
 * No debounce library is installed anywhere in this repo (see
 * `features/addressPicker/useAddressAutosuggest.ts`, the one caller that
 * needs it) — this is the hand-rolled generic instead of adding a dependency
 * for a single call site.
 *
 * Generic over `T` rather than tied to strings: any value a caller wants to
 * settle on (a search query today, something else tomorrow) works the same
 * way, and the debounced value can be fed straight into a `useEffect`
 * dependency array.
 */
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // A change before the delay elapses cancels the pending update — only
    // the value that stayed put for the full window ever lands.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
