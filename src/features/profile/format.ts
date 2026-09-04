/**
 * Display formatters for profile fields.
 *
 * The backend stores the dial code and the number separately (`countryCode`,
 * `phoneNumber`); every screen that shows a phone number needs them joined
 * the same way, so the joining lives here rather than being repeated inline.
 */
import type { MyProfile } from '../../services';

/**
 * First word of a name, or `null` when there is no name — profiles can have
 * `name: null` (a fresh owner account has no name until Profile Edit saves
 * one), so callers must render the no-name branch themselves.
 */
export function firstName(name: string | null): string | null {
  return name?.split(' ')[0] ?? null;
}

/** `+91 2121212121` — dial code and number, single space between. */
export function formatPhone(
  profile: Pick<MyProfile, 'countryCode' | 'phoneNumber'>,
): string {
  return `${profile.countryCode} ${profile.phoneNumber}`;
}

/** `role` is a lowercase enum on the wire (`owner` | `technician`) — title-case it for display. */
export function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
