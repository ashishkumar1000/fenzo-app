/**
 * bellBadge — the badge pill's text vocabulary, shared by every bell
 * surface (owner Jobs header, Home header, technician Today header —
 * Story 14-3). Pure text logic; the COUNT itself is the shared store's
 * contract (tested in useNotifications.test.ts).
 */
import { bellBadgeLabel } from './bellBadge';

describe('bellBadgeLabel', () => {
  it('renders zero as "0" (an explicit zero, not a hidden pill)', () => {
    expect(bellBadgeLabel(0)).toBe('0');
  });

  it('renders small counts as their own number', () => {
    expect(bellBadgeLabel(1)).toBe('1');
    expect(bellBadgeLabel(7)).toBe('7');
  });

  it('accepts counts up to and including the 99 cap', () => {
    expect(bellBadgeLabel(98)).toBe('98');
    expect(bellBadgeLabel(99)).toBe('99');
  });

  it('caps runaway counts at "99+" so the pill cannot blow out', () => {
    expect(bellBadgeLabel(100)).toBe('99+');
    expect(bellBadgeLabel(9999)).toBe('99+');
  });
});
