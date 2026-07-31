/**
 * Display formatters for profile fields.
 *
 * The backend stores the dial code and the number separately (`countryCode`,
 * `phoneNumber`); every screen that shows a phone number needs them joined
 * the same way, so the joining lives here rather than being repeated inline.
 */
import type { MyProfile } from '../../services';

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
