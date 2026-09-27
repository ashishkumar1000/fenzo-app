/**
 * useIstToday — today's IST calendar date, kept live for as long as the
 * component is mounted.
 *
 * `istTodayDate()` on its own is a snapshot. A screen that reads it once at
 * mount keeps the day it opened on: a Holidays screen left open across IST
 * midnight files a holiday that has just become past under "Upcoming", and
 * the date pickers keep yesterday's floor and default.
 *
 * Why a tick and not a focus effect: the consumers are navigator screens, but
 * focus alone would not cover the common case — the Owner backgrounds the app
 * in the evening and returns the next morning, and a screen that never lost
 * focus never re-runs a focus effect. A timer covers it while the app is
 * foregrounded and the `active` listener covers the resume (RN stalls timers
 * while backgrounded — see `useNow`), so the hook is correct regardless of
 * navigation state and needs no dependency on react-navigation.
 *
 * Sibling of `useNow` (minute-granular renderings). This one is *day*
 * granular: every tick that does not cross midnight is a no-op, not a
 * re-render, so a screen using it re-renders once a day rather than once a
 * minute.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { istTodayDate } from '../utils';

/**
 * How often the date is re-checked. Only the midnight crossing can change the
 * answer, but a coarser tick would miss it by up to a whole interval; a minute
 * bounds the staleness to a minute while costing nothing (the ticks are
 * no-ops — see the bail-out below).
 */
const TICK_MS = 60_000;

export function useIstToday(): string {
  const [today, setToday] = useState(() => istTodayDate());

  useEffect(() => {
    const sync = () => {
      const next = istTodayDate();
      // Bail out with the previous string when the day has not changed, so
      // React skips the re-render. A tick only costs anything on the one
      // crossing per day; the identity of `today` is therefore stable, which
      // also keeps downstream `useMemo`s keyed on it from recomputing.
      setToday(prev => (prev === next ? prev : next));
    };

    const id = setInterval(sync, TICK_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') sync();
    });
    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, []);

  return today;
}
