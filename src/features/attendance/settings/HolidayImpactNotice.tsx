/**
 * HolidayImpactNotice — the debounced impact-preview banner of the add
 * holiday sheet (Story 15-6, FR-20). Owns the whole preview lifecycle
 * (the 300 ms debounce matching `useAddressAutosuggest`, the latest-wins
 * sequence guard, the "Checking impact…" interim state, and the banner
 * copy) so `HolidayFormSheet.tsx` stays under the ~300-line file limit.
 *
 * The preview runs for any valid date — past included. FR-20 asks for
 * add "incl. past" and the BE recomputes affected day statuses on read
 * (AD-10), so a past date is exactly as previewable as a future one.
 *
 * Latest-wins: the sequence counter bumps in EVERY effect branch, not
 * just the fetch branch — a response from a superseded branch (earlier
 * date, invalidated date, closed sheet) can never land. A response whose
 * `date` doesn't match the current one is also ignored, so the old
 * date's banner can't linger while the new one is still being fetched.
 *
 * Copy: at most 3 affected employees are named, "…, plus {n-3} more
 * employee(s)" beyond that (15-6 review iteration 1 — the earlier
 * "+{n-3} more employees'" dangled a possessive with no following noun and
 * had no singular); an empty list hides the banner entirely.
 *
 * Announcements: the banner text is announced via AccessibilityInfo the
 * moment it appears or changes, so a TalkBack/VoiceOver user hears the
 * impact without having to find the (visually inserted) notice (15-6
 * review iteration 1, user decision).
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { InlineNotice } from '../../../components/ui';
import type { HolidayImpactResponse } from '../../../services';

const DEBOUNCE_MS = 300;

/**
 * "Priya" / "Priya and Ramesh" / "Priya, Ramesh and Suresh" — the group the
 * banner's possessive hangs off, so the sentence reads as one phrase rather
 * than a comma list with a stranded apostrophe after it.
 */
export function joinEmployeeNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The over-cap suffix: "plus 1 more employee" / "plus 2 more employees". */
export function moreEmployeesSuffix(count: number): string {
  return `plus ${count} more employee${count === 1 ? '' : 's'}`;
}

export type HolidayImpactNoticeProps = {
  /** Preview runs only while the add sheet is open. */
  active: boolean;
  /** The date being previewed (YYYY-MM-DD). */
  date: string;
  /** The date field's live validation error — no preview until it clears. */
  dateError?: string;
  impact: (date: string) => Promise<HolidayImpactResponse>;
};

export default function HolidayImpactNotice({
  active,
  date,
  dateError,
  impact,
}: HolidayImpactNoticeProps) {
  const [result, setResult] = useState<HolidayImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const seqRef = useRef(0);
  useEffect(() => {
    // Bump in every branch so a response from a superseded branch can
    // never land — including one that resolves while the sheet is closed.
    const seq = ++seqRef.current;
    if (!active || dateError) {
      setResult(null);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await impact(date);
        if (seq !== seqRef.current) return;
        setResult(res);
      } catch {
        if (seq !== seqRef.current) return;
        setResult(null);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, date, dateError, impact]);

  // Announce the settled banner so dynamic content reaches screen readers
  // (the notice is visually INSERTED, not a focus target). Fires only when
  // a real message is showing — never for the interim "Checking impact…"
  // state, and never while the sheet is closed. Declared BEFORE the early
  // return below so the hook order is stable across open/close.
  const current = result && result.date === date ? result : null;
  const affected = current?.affectedEmployees ?? [];
  const visibleNames = affected.slice(0, 3).map((e) => e.employeeName);
  const moreCount = Math.max(0, affected.length - 3);
  const message =
    active && affected.length > 0
      ? affected.length <= 3
        ? `This date overlaps ${joinEmployeeNames(visibleNames)}'s approved leave. It will no longer count as leave for them.`
        : `This date overlaps approved leave for ${joinEmployeeNames(visibleNames)}, ${moreEmployeesSuffix(moreCount)}. It will no longer count as leave for them.`
      : null;
  useEffect(() => {
    if (message) {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);

  if (!active) return null;

  if (message) {
    // While the new date's response is still being fetched, the old
    // message is replaced by the interim state rather than shown.
    return (
      <InlineNotice
        tone="info"
        message={loading ? 'Checking impact…' : message}
      />
    );
  }
  if (loading) {
    return <InlineNotice tone="info" message="Checking impact…" />;
  }
  return null;
}
