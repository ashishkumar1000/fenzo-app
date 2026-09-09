/**
 * OwnerRealtimeBridge — the technician-safety AC automated: probe-rendered
 * with a mocked TECHNICIAN session it renders nothing and runs zero
 * Realtime code (the hook is called with `enabled: false` — the allowlist
 * also suspends a bootstrap-null session). Owner path: renders the banner
 * through. StatusBanner's own rendering is covered by
 * `src/components/StatusBanner.test.tsx`.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

let mockSession: { role: string; tenantId: string } | null = { role: 'owner', tenantId: 't1' };
jest.mock('../auth/useAuth', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockUseOwnerNotifications = jest.fn();
jest.mock('./useOwnerNotifications', () => ({
  useOwnerNotifications: (opts: unknown) => mockUseOwnerNotifications(opts),
}));

jest.mock('../../components/StatusBanner', () => ({
  StatusBanner: ({ banner }: { banner: OwnerNotificationBanner | null }) =>
    banner ? `banner:${banner.text}` : null,
}));

import { OwnerRealtimeBridge } from './OwnerRealtimeBridge';
import type { OwnerNotificationBanner } from './useOwnerNotifications';

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
    renderer = ReactTestRenderer.create(React.createElement(OwnerRealtimeBridge));
  });
  return renderer;
}

beforeEach(() => {
  mockSession = { role: 'owner', tenantId: 't1' };
});

afterEach(() => jest.clearAllMocks());

describe('OwnerRealtimeBridge', () => {
  it('technician session: renders nothing and suspends the hook (enabled: false)', () => {
    mockSession = { role: 'technician', tenantId: 't1' };
    mockUseOwnerNotifications.mockReturnValue({ banner: null });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseOwnerNotifications).toHaveBeenCalledWith({ enabled: false });
  });

  it('bootstrap (no session yet): suspends the hook like a technician session', () => {
    mockSession = null;
    mockUseOwnerNotifications.mockReturnValue({ banner: null });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseOwnerNotifications).toHaveBeenCalledWith({ enabled: false });
  });

  it('owner session with no live banner: renders nothing', () => {
    mockSession = { role: 'owner', tenantId: 't1' };
    mockUseOwnerNotifications.mockReturnValue({ banner: null });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseOwnerNotifications).toHaveBeenCalledWith({ enabled: true });
  });

  it('owner session with a live banner: renders StatusBanner', () => {
    mockSession = { role: 'owner', tenantId: 't1' };
    mockUseOwnerNotifications.mockReturnValue({ banner: BANNER });

    const renderer = mount();

    expect(renderer.toJSON()).not.toBeNull();
  });
});
