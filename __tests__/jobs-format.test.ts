/**
 * Pure display mappings in `src/features/jobs/format.ts`.
 */
import {
  formatTimeLabel,
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