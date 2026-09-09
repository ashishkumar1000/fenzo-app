/**
 * useOwnerNotifications — tested through a react-test-renderer probe with
 * every I/O surface mocked (same approach as __tests__/useJobs.test.ts):
 * the services barrel (token exchange + channel factory), the profile
 * store, the jobs store's loadJobs, and AppState. No real socket in jest.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppState } from 'react-native';

let mockProfile: { id: string } | null = null;
jest.mock('../profile/useMyProfile', () => ({
  useMyProfile: () => ({ profile: mockProfile }),
  loadMyProfile: jest.fn(),
}));

jest.mock('../jobs/useJobs', () => ({ loadJobs: jest.fn() }));

jest.mock('../../services', () => ({
  getRealtimeToken: jest.fn(),
  getOwnerChannel: jest.fn(),
  teardownOwnerChannel: jest.fn(),
  ownerNotificationsTopic: (userId: string) => `user:${userId}:notifications`,
  registerReset: jest.fn(() => jest.fn()),
}));

import { loadJobs } from '../jobs/useJobs';
import { loadMyProfile } from '../profile/useMyProfile';
import {
  getOwnerChannel,
  getRealtimeToken,
  ownerNotificationsTopic,
  registerReset,
  teardownOwnerChannel,
} from '../../services';
import {
  OwnerNotificationBanner,
  shouldSubscribe,
  useOwnerNotifications,
} from './useOwnerNotifications';

const getRealtimeTokenMock = getRealtimeToken as jest.Mock;
const getOwnerChannelMock = getOwnerChannel as jest.Mock;
const teardownOwnerChannelMock = teardownOwnerChannel as jest.Mock;
const registerResetMock = registerReset as jest.Mock;
const loadJobsMock = loadJobs as jest.Mock;
const loadMyProfileMock = loadMyProfile as jest.Mock;

/** Chainable channel stub: `.on(...)` and `.subscribe()` both return it —
 * real supabase-js's `subscribe()` returns the channel, and the hook stores
 * the chain's result as its ref, so the stub must do the same. */
function makeChannel() {
  const channel: {
    on: jest.Mock;
    subscribe: jest.Mock;
  } = {
    on: jest.fn(),
    subscribe: jest.fn(),
  };
  channel.on.mockImplementation(() => channel);
  channel.subscribe.mockImplementation(() => channel);
  return channel;
}

type BroadcastCallback = (message: unknown) => void;
/** The callback `.on('broadcast', { event: 'INSERT' }, cb)` registered. */
let broadcastCb: BroadcastCallback | null = null;
let channel: ReturnType<typeof makeChannel>;

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TOPIC = `user:${USER_ID}:notifications`;

let probe: { banner: OwnerNotificationBanner | null } | null = null;
function Probe(): null {
  probe = useOwnerNotifications();
  return null;
}

let appStateListener: ((state: string) => void) | null = null;

function mountProbe(): Promise<void> {
  return ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(React.createElement(Probe));
    await Promise.resolve(); // flush the async token exchange → subscribe
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockProfile = { id: USER_ID };
  broadcastCb = null;
  channel = makeChannel();
  getOwnerChannelMock.mockImplementation(() => channel);
  getRealtimeTokenMock.mockResolvedValue('realtime-jwt');
  loadJobsMock.mockResolvedValue(undefined);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: never,
  ) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  }) as never);
  // RN's jest AppState mock reports 'active' by default.
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});

afterEach(async () => {
  // Pending banner timers fire setState — flush them INSIDE act.
  await ReactTestRenderer.act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('shouldSubscribe (foreground gate)', () => {
  it("subscribes only on 'active'", () => {
    expect(shouldSubscribe('active')).toBe(true);
    expect(shouldSubscribe('inactive')).toBe(false); // app-switcher glance = background
    expect(shouldSubscribe('background')).toBe(false);
  });
});

describe('subscription lifecycle', () => {
  it('derives the topic from the profile id and joins the private channel on mount', async () => {
    await mountProbe();

    expect(getRealtimeTokenMock).toHaveBeenCalled();
    expect(ownerNotificationsTopic(USER_ID)).toBe(TOPIC);
    expect(getOwnerChannelMock).toHaveBeenCalledWith(USER_ID);
    expect(channel.on).toHaveBeenCalledWith('broadcast', { event: 'INSERT' }, expect.any(Function));
    expect(channel.subscribe).toHaveBeenCalled();
    expect(teardownOwnerChannelMock).not.toHaveBeenCalled();

    broadcastCb = channel.on.mock.calls[0][2] as BroadcastCallback;
  });

  it('never exchanges a token or joins a channel when disabled (technician safety)', async () => {
    mockProfile = null;
    // Holder object — a `let` assigned inside the probe closure narrows to
    // `never` under tsc's control-flow analysis.
    const holder: { banner: OwnerNotificationBanner | null } = { banner: null };
    function DisabledProbe(): null {
      holder.banner = useOwnerNotifications({ enabled: false }).banner;
      return null;
    }
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(React.createElement(DisabledProbe));
    });

    expect(getRealtimeTokenMock).not.toHaveBeenCalled();
    expect(getOwnerChannelMock).not.toHaveBeenCalled();
    expect(holder.banner).toBeNull();
  });

  it('does not subscribe without a login token (token exchange fails / logged out)', async () => {
    getRealtimeTokenMock.mockResolvedValue(null);
    await mountProbe();

    expect(getOwnerChannelMock).not.toHaveBeenCalled();
    expect(channel.subscribe).not.toHaveBeenCalled();
  });

  /** A token exchange that stays in flight until the test resolves it. */
  function deferToken(): (v: string) => void {
    let resolveToken!: (v: string) => void;
    getRealtimeTokenMock.mockReturnValue(
      new Promise<string>(resolve => {
        resolveToken = resolve;
      }),
    );
    return resolveToken;
  }

  it('never opens a socket when the app backgrounds during the token exchange', async () => {
    const resolveToken = deferToken();
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(React.createElement(Probe));
    });
    expect(getOwnerChannelMock).not.toHaveBeenCalled();

    // Background while the exchange is in flight, THEN let it resolve —
    // the socket must never open behind the foreground rule's back.
    await ReactTestRenderer.act(async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'background',
        configurable: true,
      });
      appStateListener?.('background');
    });
    await ReactTestRenderer.act(async () => {
      resolveToken('realtime-jwt');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getOwnerChannelMock).not.toHaveBeenCalled();
    expect(channel.subscribe).not.toHaveBeenCalled();

    // Foregrounding afterwards subscribes normally.
    await ReactTestRenderer.act(async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'active',
        configurable: true,
      });
      appStateListener?.('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(channel.subscribe).toHaveBeenCalled();
  });

  it('adopts only one channel across a rapid flap — the loser is torn down, not leaked', async () => {
    const resolveToken = deferToken();
    const winner = makeChannel();
    const loser = makeChannel();
    getOwnerChannelMock
      .mockImplementationOnce(() => winner)
      .mockImplementationOnce(() => loser);

    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(React.createElement(Probe));
    });
    // Setup #1 is mid-flight on the deferred token; a background/foreground
    // flap starts setup #2 against the same pending exchange.
    await ReactTestRenderer.act(async () => {
      appStateListener?.('background');
      appStateListener?.('active');
    });
    await ReactTestRenderer.act(async () => {
      resolveToken('realtime-jwt');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getOwnerChannelMock).toHaveBeenCalledTimes(2);
    // The winner was adopted; the loser's channel was torn down instead of
    // overwriting it (the pre-review bug leaked it permanently).
    expect(teardownOwnerChannelMock).toHaveBeenCalledTimes(1);
    expect(teardownOwnerChannelMock).toHaveBeenCalledWith(loser);
  });

  it('tears the channel down on app background and re-subscribes on foreground', async () => {
    await mountProbe();
    expect(teardownOwnerChannelMock).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      appStateListener?.('background');
    });
    expect(teardownOwnerChannelMock).toHaveBeenCalledWith(channel);

    await ReactTestRenderer.act(async () => {
      appStateListener?.('active');
      await Promise.resolve();
    });
    // Re-subscribed: a second registration of the INSERT handler.
    const insertSubs = channel.on.mock.calls.filter(c => c[1]?.event === 'INSERT');
    expect(insertSubs.length).toBe(2);
  });

  it('registers with resetRegistry and tears down on the global 401 reset', async () => {
    await mountProbe();
    expect(registerResetMock).toHaveBeenCalledTimes(1);

    const reset = registerResetMock.mock.calls[0][0] as () => void;
    await ReactTestRenderer.act(async () => {
      reset();
    });
    expect(teardownOwnerChannelMock).toHaveBeenCalledWith(channel);

    // A post-reset event lands on a torn-down channel — the handler is gone
    // with it, so no refetch can leak out of the logged-out world.
  });

  it('drops events whose topic is stale after a user switch', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(Probe));
      await Promise.resolve();
      await Promise.resolve();
    });
    broadcastCb = channel.on.mock.calls[0][2] as BroadcastCallback;

    // User switch: profile store changes → re-render → the hook tears the
    // old channel down and re-derives the topic from the new profile.
    const USER_2 = '22222222-2222-2222-2222-222222222222';
    await ReactTestRenderer.act(async () => {
      mockProfile = { id: USER_2 };
      renderer.update(React.createElement(Probe));
      await Promise.resolve();
      await Promise.resolve();
    });
    // Simulate the pre-teardown in-flight event from the OLD channel.
    const fullPayload = {
      job_number: 'JOB-1042',
      step: 'on_my_way',
      technician_name: 'Priya',
    };
    await ReactTestRenderer.act(async () => {
      broadcastCb?.({ record: fullPayload });
      await Promise.resolve();
    });
    // The stale event never raised a banner or refetch: the only loadJobs
    // call (if any) came from a re-subscription, not this event.
    expect(loadJobsMock).not.toHaveBeenCalledWith(
      undefined,
      undefined,
      { force: true },
    );
  });
});

describe('event handling', () => {
  beforeEach(async () => {
    await mountProbe();
    broadcastCb = channel.on.mock.calls[0][2] as BroadcastCallback;
  });

  it('force-refetches jobs and raises the banner on a broadcast INSERT', async () => {
    await ReactTestRenderer.act(async () => {
      broadcastCb?.({
        id: 'evt-1',
        table: 'notifications',
        operation: 'INSERT',
        record: {
          id: 'n1',
          event_type: 'on_my_way',
          payload: { job_number: 'JOB-1042', step: 'on_my_way', technician_name: 'Priya' },
        },
      });
      await Promise.resolve();
    });

    expect(loadJobsMock).toHaveBeenCalledWith(undefined, undefined, { force: true });
    // Post-spec extension: Home renders from the profile store, so the event
    // force-refreshes it too (user-approved, 2026-09-09 device spike).
    expect(loadMyProfileMock).toHaveBeenCalledWith({ force: true });
    expect(probe?.banner?.text).toBe('Priya · JOB-1042 · On my way');
  });

  it('shows the drift-fallback copy on a malformed payload — refetch still happens', async () => {
    await ReactTestRenderer.act(async () => {
      broadcastCb?.({ record: { id: 'n1' } });
      await Promise.resolve();
    });

    expect(loadJobsMock).toHaveBeenCalledWith(undefined, undefined, { force: true });
    expect(probe?.banner?.text).toBe('Job status updated');
  });

  it('drops an in-flight event that lands after the background teardown', async () => {
    await ReactTestRenderer.act(async () => {
      appStateListener?.('background');
    });
    // Simulate the channel's async removal lagging behind the teardown: its
    // handler fires while the app is backgrounded.
    Object.defineProperty(AppState, 'currentState', {
      value: 'background',
      configurable: true,
    });
    await ReactTestRenderer.act(async () => {
      broadcastCb?.({
        record: { payload: { job_number: 'J1', step: 'arrived', technician_name: 'Ravi' } },
      });
      await Promise.resolve();
    });

    expect(loadJobsMock).not.toHaveBeenCalledWith(undefined, undefined, { force: true });
    expect(loadMyProfileMock).not.toHaveBeenCalledWith({ force: true });
    expect(probe?.banner).toBeNull();
  });

  it('auto-dismisses the banner after 4s', async () => {
    await ReactTestRenderer.act(async () => {
      broadcastCb?.({
        record: { payload: { job_number: 'J1', step: 'arrived', technician_name: 'Ravi' } },
      });
      await Promise.resolve();
    });
    expect(probe?.banner).not.toBeNull();

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(probe?.banner).toBeNull();
  });

  it('replaces the banner content and resets the timer on a newer event', async () => {
    await ReactTestRenderer.act(async () => {
      broadcastCb?.({
        record: { payload: { job_number: 'J1', step: 'arrived', technician_name: 'Ravi' } },
      });
      await Promise.resolve();
    });

    // Second event 3s in — the FIRST event's timer must not dismiss it.
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(3000);
      broadcastCb?.({
        record: { payload: { job_number: 'J2', step: 'completed', technician_name: 'Sana' } },
      });
      await Promise.resolve();
    });
    expect(probe?.banner?.text).toBe('Sana · J2 · Completed');

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(probe?.banner).toBeNull();
  });
});
