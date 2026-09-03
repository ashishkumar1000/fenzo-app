/**
 * Pure display mappings in `src/features/jobs/format.ts`.
 */
import {
  formatTimeLabel,
  serviceTypeLabel,
  serviceTypeToIcon,
  statusToBadge,
} from '../src/features/jobs/format';
import type { JobStatusApi } from '../src/services';

describe('statusToBadge', () => {
  it.each([
    ['scheduled', 'scheduled'],
    ['in_progress', 'progress'],
    ['completed', 'done'],
    ['cancelled', 'cancelled'],
  ] as const)('maps %s to the %s badge key', (apiStatus, badge) => {
    expect(statusToBadge(apiStatus)).toBe(badge);
  });

  it('falls back to scheduled for an unknown status (enum drift)', () => {
    expect(statusToBadge('mystery_status' as JobStatusApi)).toBe('scheduled');
  });
});

describe('serviceTypeToIcon', () => {
  it.each([
    ['ac_service', 'snowflake'],
    ['ac_installation', 'snowflake'],
    ['plumbing', 'droplet'],
    ['pest_control', 'wrench'],
    ['electrical', 'wrench'],
    ['other', 'wrench'],
  ] as const)('maps %s to the %s icon', (serviceType, icon) => {
    expect(serviceTypeToIcon(serviceType)).toBe(icon);
  });
});

describe('serviceTypeLabel', () => {
  it.each([
    ['ac_service', 'AC service'],
    ['ac_installation', 'AC installation'],
    ['pest_control', 'Pest control'],
    ['plumbing', 'Plumbing'],
    ['electrical', 'Electrical'],
    ['other', 'Service'],
  ] as const)('labels %s as "%s"', (serviceType, label) => {
    expect(serviceTypeLabel(serviceType)).toBe(label);
  });
});

describe('formatTimeLabel', () => {
  // Built from local-time components (not ISO strings) so the assertions
  // hold in any timezone — the label renders in the device's zone.
  const start = new Date(2026, 7, 12, 14, 0);
  const end = new Date(2026, 7, 12, 16, 30);

  it('formats a start–end range with an en dash', () => {
    expect(formatTimeLabel(start.toISOString(), end.toISOString())).toMatch(/^2:00\s*\S*\s*[–-]\s*4:30/);
    expect(formatTimeLabel(start.toISOString(), end.toISOString())).toMatch(/[AP]M/i);
  });

  it('formats a single time when there is no end', () => {
    const label = formatTimeLabel(start.toISOString(), null);
    expect(label).toMatch(/^2:00/);
    expect(label).not.toMatch(/[–-]/);
  });
});