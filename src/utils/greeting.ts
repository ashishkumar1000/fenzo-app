/**
 * Time-of-day greeting in the device's clock. The old screens hardcoded
 * "Good morning" at all hours (FN-2026-10-03 F18).
 */
export function greetingForNow(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
