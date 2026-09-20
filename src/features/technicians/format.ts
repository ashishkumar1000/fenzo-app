/**
 * Display/search helpers for the profile roster (`ProfileTechnician`). Kept
 * out of the components so the picker tiles and the Select screen's rows
 * share one definition of "phone" and one search filter — the same
 * separation `customers/format.ts` gives its surfaces.
 */
import type { ProfileTechnician } from '../../services';

/** `+91 6765644658` — dial code and number, single space between. Mirrors
 *  `customerPhone`; both sides store digits without the dial code. */
export function technicianPhone(
  technician: Pick<ProfileTechnician, 'countryCode' | 'phoneNumber'>,
): string {
  return `${technician.countryCode} ${technician.phoneNumber}`;
}

/**
 * Client-side search over the profile roster. Small list, so client-side is
 * free — but the semantics mirror `filterCustomers` (name OR phone digits)
 * so a later server-side switch is invisible to the user.
 *
 * Phone matching uses only the digits of the query, so a partial number
 * typed with stray punctuation still matches the stored digits-only number.
 */
export function filterTechnicians(
  technicians: ProfileTechnician[],
  query: string,
): ProfileTechnician[] {
  const q = query.trim().toLowerCase();
  if (!q) return technicians;
  const digits = q.replace(/\D/g, '');
  return technicians.filter(
    t =>
      t.name.toLowerCase().includes(q) ||
      (digits.length > 0 && t.phoneNumber.includes(digits)),
  );
}
