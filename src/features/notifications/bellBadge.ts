/**
 * bellBadge.ts — the bell badge's text vocabulary, shared by the numeric
 * badge surfaces (owner Jobs header, technician Today header — Story 14-3):
 * capped at 99+ so a runaway count can't blow the pill out. The badge COUNT
 * always comes from the shared `useNotifications` store. (The Home header's
 * bell is a dot-only badge and keeps its own dot vocabulary.)
 */

/** Cap for the badge pill — anything above renders "99+". */
const BELL_BADGE_CAP = 99;

export function bellBadgeLabel(count: number): string {
  return count > BELL_BADGE_CAP ? '99+' : String(count);
}
