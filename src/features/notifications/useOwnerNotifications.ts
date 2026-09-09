/**
 * useOwnerNotifications — Supabase Realtime as a refetch hint for the owner
 * (Story 3.3). Realtime is never a source of truth: an event force-refetches
 * the jobs store (`GET /jobs` — the Jobs tab) AND the profile store
 * (`GET /users/me` — Home's counts and Today's-jobs cards, a user-approved
 * post-spec extension) and raises a transient banner; all job state keeps
 * flowing from those GETs through the existing stores.
 *
 * Lifecycle rules (per the story spec):
 * - Foreground-only: one socket while the app is `active`, zero while
 *   backgrounded (`'inactive'` counts as background — app-switcher glances
 *   tear down and re-subscribe; that flap is accepted battery-friendly
 *   behaviour, not a bug).
 * - Topic-derived-from-profile: `user:<owner_id>:notifications`, rebuilt
 *   whenever the signed-in user changes (profile store resets to null on
 *   the global 401 reset, which tears the socket down with it).
 * - Silent degradation: a failed token exchange or socket error is
 *   log-only — the app is fully functional without the socket via the
 *   existing focus-refresh/pull-to-refresh paths.
 * - `resetRegistry` teardown composes with the global 401 reset that App.tsx
 *   wires via `setOnUnauthorized → runAllResets()`.
 *
 * Mounted ONLY via `OwnerRealtimeBridge` in the owner branch of App.tsx's
 * role gate — `enabled: false` (technician session) means zero Realtime
 * code runs: no listener, no subscription, no token exchange.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { loadMyProfile, useMyProfile } from '../profile/useMyProfile';
import { loadJobs } from '../jobs/useJobs';
// Story 3.4: a broadcast is the cheapest unread-count signal there is —
// refresh the bell's badge alongside the stores it already force-refetches.
import { loadUnreadCount } from './useNotifications';
import {
  getRealtimeToken,
  getOwnerChannel,
  ownerNotificationsTopic,
  registerReset,
  teardownOwnerChannel,
} from '../../services';
import {
  BANNER_VISIBLE_MS,
  bannerPartsFromEvent,
  bannerTextFromParts,
  eventRowPayload,
  notificationStepStatus,
  type JobStatusEventPayload,
} from './notificationBannerModel';
import type { StatusKey } from '../../theme';

export interface OwnerNotificationBanner {
  /** Render-ready line (all fields joined), e.g. "Priya · JOB-1042 · On my way" — also the accessibility label. */
  text: string;
  /** Per-field parts — the toast renders each independently, dropping whatever the payload lacked. */
  technicianName: string | null;
  jobNumber: string | null;
  stepLabel: string | null;
  stepStatus: StatusKey;
}

/**
 * The foreground gate, extracted pure so the AppState rule is unit-testable
 * without a device. iOS nuance: only `'active'` subscribes — `'inactive'`
 * (app switcher, notification-centre glance) counts as background.
 */
export function shouldSubscribe(appState: string): boolean {
  return appState === 'active';
}

interface UseOwnerNotificationsOptions {
  /** `false` (technician session) suspends everything. */
  enabled?: boolean;
}

export function useOwnerNotifications(
  options: UseOwnerNotificationsOptions = {},
): { banner: OwnerNotificationBanner | null } {
  const { enabled = true } = options;
  const { profile } = useMyProfile();
  const userId = profile?.id ?? null;

  const [banner, setBanner] = useState<OwnerNotificationBanner | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  /** Topic the CURRENT session listens on — events from a stale topic are dropped. */
  const topicRef = useRef<string | null>(null);

  const dismissTimer = () => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  };

  /**
   * A new event while a banner is visible REPLACES the content and RESETS
   * the timer — the first event's timer must never dismiss the second
   * event's banner.
   */
  const showBanner = (payload: JobStatusEventPayload | null) => {
    dismissTimer();
    const parts = bannerPartsFromEvent(payload);
    setBanner({
      text: bannerTextFromParts(parts),
      technicianName: parts.technicianName,
      jobNumber: parts.jobNumber,
      stepLabel: parts.stepLabel,
      stepStatus: notificationStepStatus(parts.step),
    });
    bannerTimerRef.current = setTimeout(() => {
      bannerTimerRef.current = null;
      setBanner(null);
    }, BANNER_VISIBLE_MS);
  };

  /**
   * The single event-handling seam — the pure entry point Phase 2's push
   * handler will call from its foreground/background message listener, so
   * push integration is a new caller, not a rewrite. Force-refetches both
   * stores (bypassing their throttles) and raises the banner; a burst of
   * events is serialized by `loadJobs`'s shared in-flight queue.
   */
  const handleJobStatusEvent = (topic: string, message: unknown) => {
    // In-flight event from a channel the session has already moved off —
    // an event can land after a user switch before teardown completes.
    if (topicRef.current !== topic) return;
    // Mid-flight event after a background teardown — the channel's removal
    // is async, so its handler can still fire while the app is backgrounded;
    // the foreground rule forbids any banner/refetch work in that state.
    if (!shouldSubscribe(AppState.currentState)) return;
    showBanner(eventRowPayload(message));
    void loadJobs(undefined, undefined, { force: true });
    // Story 3.4: the bell badge tracks the same stream of events — force
    // past the count TTL so a burst of events can't be throttled away.
    void loadUnreadCount({ force: true });
    // Post-spec extension (user-approved, 2026-09-09 device spike): Home is
    // the screen the owner actually sits on, and it renders from the profile
    // store (`GET /users/me` — job counts + the Today's-jobs section), a
    // DIFFERENT store from the Jobs tab's. Force it too, so the whole
    // dashboard updates live. `force` matches the jobs refetch: a throttled
    // call within the focus TTL would silently skip and leave Home stale.
    // FUTURE OPTIMIZATION: /users/me is the heavy endpoint (full roster +
    // customers/jobs pages) fetched to flip one status badge — fine at one
    // event per technician step; if event frequency ever grows (Story 3.4
    // push, many technicians), add a lightweight summary endpoint (counts +
    // today's jobs only) and point this handler at it instead.
    void loadMyProfile({ force: true });
  };

  useEffect(() => {
    if (!enabled || !userId) {
      topicRef.current = null;
      dismissTimer();
      setBanner(null);
      return undefined;
    }

    const topic = ownerNotificationsTopic(userId);
    topicRef.current = topic;
    let disposed = false;

    const teardownChannel = () => {
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) teardownOwnerChannel(channel);
    };

    const setupChannel = async () => {
      if (disposed || channelRef.current) return;
      const token = await getRealtimeToken();
      if (disposed || !token || topicRef.current !== topic) return;
      // The token fetch awaited a state change mid-flight — never open a
      // socket the foreground rule now forbids (backgrounding during the
      // fetch used to leave the socket subscribed while backgrounded).
      if (!shouldSubscribe(AppState.currentState)) return;

      const channel = getOwnerChannel(userId)
        .on('broadcast', { event: 'INSERT' }, (message: unknown) =>
          handleJobStatusEvent(topic, message),
        )
        .subscribe(status => {
          // Log-only — connect failures are silent to the user.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[useOwnerNotifications] socket ${status} on ${topic}`);
          }
        });
      // Re-check everything the await may have invalidated (a rapid
      // background/foreground flap can have two setups in flight — the
      // loser's channel is torn down here, not overwritten into a leak).
      if (
        disposed ||
        topicRef.current !== topic ||
        !shouldSubscribe(AppState.currentState) ||
        channelRef.current
      ) {
        teardownOwnerChannel(channel);
        return;
      }
      channelRef.current = channel;
    };

    const onAppStateChange = (state: string) => {
      if (shouldSubscribe(state)) void setupChannel();
      else teardownChannel();
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    if (shouldSubscribe(AppState.currentState)) void setupChannel();

    // Global 401 reset: socket gone, banner gone. Registered while mounted
    // (the bridge unmounts with the owner session) — mirrors the
    // one-line-per-store pattern in resetRegistry.ts.
    const unregisterReset = registerReset(() => {
      teardownChannel();
      topicRef.current = null;
      dismissTimer();
      setBanner(null);
    });

    return () => {
      disposed = true;
      subscription.remove();
      unregisterReset();
      teardownChannel();
      topicRef.current = null;
      dismissTimer();
    };
    // handleJobStatusEvent closes over stable refs only; showBanner over
    // refs — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId]);

  return { banner };
}
