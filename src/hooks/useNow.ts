/**
 * useNow — the current wall-clock ms, re-ticked on an interval.
 *
 * For renderings that go stale as real time passes (the urgency rail on
 * job lists): one hook per screen ticks, not one per row. 60s default —
 * the consumers' thresholds are minute-granular, so a tighter tick buys
 * nothing.
 *
 * RN stalls timers while the app is backgrounded, so a resume can leave the
 * clock minutes behind the last tick — the hook listens for `active` and
 * re-syncs the moment the app is foregrounded. Backgrounded screens tick no
 * more than the stalled timer allows; the re-sync is what keeps them honest.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** A floor on the caller's interval — 0 or negative would busy-loop. */
const MIN_INTERVAL_MS = 1_000;

export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ms = Math.max(MIN_INTERVAL_MS, intervalMs);
    const id = setInterval(() => setNow(Date.now()), ms);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, [intervalMs]);

  return now;
}