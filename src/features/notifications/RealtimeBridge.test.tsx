/**
 * RealtimeBridge — Story 14-3's dual-role mount, automated: probe-rendered
 * with a mocked session per role. Owner path renders the banner through;
 * a technician session ENABLES the hook (their socket must open — the
 * token endpoint opened to technicians in Story 14-2) but never renders
 * StatusBanner (no job-status events are ever emitted to technicians); a
 * bootstrap-null session suspends the hook entirely. StatusBanner's own
 * rendering is covered by `src/components/StatusBanner.test.tsx`.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

let mockSession: { role: string; tenantId: string } | null = { role: 'owner', tenantId: 't1' };
jest.mock('../auth/useAuth', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockUseRealtimeNotifications = jest.fn();
jest.mock('./useRealtimeNotifications', () => ({
  useRealtimeNotifications: (opts: unknown) => mockUseRealtimeNotifications(opts),
}));

jest.mock('../../components/StatusBanner', () => ({
  StatusBanner: ({ banner }: { banner: OwnerNotificationBanner | null }) =>
    banner ? `banner:${banner.text}` : null,
}));

import { RealtimeBridge } from './RealtimeBridge';
import type { OwnerNotificationBanner } from './useRealtimeNotifications';

const BANNER: OwnerNotificationBanner = {
  text: 'Priya · JOB-1042 · On my way',
  technicianName: 'Priya',
  jobNumber: 'JOB-1042',
  stepLabel: 'On my way',
  stepStatus: 'progress',
};

function mount(): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(React.createElement(RealtimeBridge));
  });
  return renderer;
}

beforeEach(() => {
  mockSession = { role: 'owner', tenantId: 't1' };
});

afterEach(() => jest.clearAllMocks());

describe('RealtimeBridge', () => {
  it('technician session: enables the hook but renders no banner', () => {
    mockSession = { role: 'technician', tenantId: 't1' };
    mockUseRealtimeNotifications.mockReturnValue({ banner: BANNER });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseRealtimeNotifications).toHaveBeenCalledWith({ enabled: true });
  });

  it('bootstrap (no session yet): suspends the hook entirely', () => {
    mockSession = null;
    mockUseRealtimeNotifications.mockReturnValue({ banner: null });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseRealtimeNotifications).toHaveBeenCalledWith({ enabled: false });
  });

  it('owner session with no live banner: renders nothing', () => {
    mockSession = { role: 'owner', tenantId: 't1' };
    mockUseRealtimeNotifications.mockReturnValue({ banner: null });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseRealtimeNotifications).toHaveBeenCalledWith({ enabled: true });
  });

  it('owner session with a live banner: renders StatusBanner', () => {
    mockSession = { role: 'owner', tenantId: 't1' };
    mockUseRealtimeNotifications.mockReturnValue({ banner: BANNER });

    const renderer = mount();

    expect(renderer.toJSON()).not.toBeNull();
  });
});
