/**
 * TechJobDetailScreen — the technician's one-screen view of a job, fetched
 * fresh on every open (the attachments' presigned URLs are 1-hour and
 * regenerated per call — a refetch is the only retry, so the detail is
 * never cached, matching the owner detail's reasoning).
 *
 * This file owns state only: fetch (single-flight, chained reloads, abort),
 * the back header, the pull-to-refresh, and which view to show (error states
 * vs the loaded content, which lives in `TechJobDetailContent`). The 3.3
 * workflow advance lives in `useWorkflowAdvance`; this screen only routes
 * its branches (a 403 → the unassigned view).
 *
 * A 403 means the job is no longer assigned to the caller (reassigned away)
 * — a dedicated view explains it and refetches Today on the way out, so the
 * stale card is gone when the technician lands back on the list. The 403
 * arms `wasUnassignedRef` on ANY load (first or refresh), not just the first.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Badge, IconButton } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { jobService } from '../../services';
import type { ApiError, JobDetail } from '../../services';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import { apiJobOf, loadToday, upsertTechnicianJob } from './useTechnicianJobs';
import { statusToBadge } from '../jobs/format';
import { actionBarAction } from './workflowActionBarModel';
import { useWorkflowAdvance } from './useWorkflowAdvance';
import { FailedView, NotFoundView, UnassignedView } from './components/DetailErrorViews';
import { TechJobDetailContent } from './components/TechJobDetailContent';
import { WorkflowActionBar } from './components/WorkflowActionBar';

type Navigation = NativeStackNavigationProp<TechnicianRootStackParamList, 'TechJobDetail'>;

/** Badge labels — the one title-case exception in the design system. */
const STATUS_LABEL = {
  done: 'Done',
  progress: 'In Progress',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
} as const;

/**
 * True when a failure is the app's own abort (the screen unmounted mid-request),
 * not a real error — detected by shape (axios' `CANCELLED`), by name (a raw
 * fetch `AbortError`), or by the signal itself having been aborted.
 */
function isAbort(error: ApiError, signal: AbortSignal): boolean {
  return (
    (error.status === 0 && error.code === 'CANCELLED') ||
    (error as { name?: string }).name === 'AbortError' ||
    signal.aborted
  );
}

export default function TechJobDetailScreen() {
  const navigation = useNavigation<Navigation>();
  // Route-params guard: a deep link that lands here without a jobId has
  // nothing to show — pop back instead of crashing.
  const jobId = useRoute<RouteProp<TechnicianRootStackParamList, 'TechJobDetail'>>().params?.jobId;

  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // The in-flight load's promise: new loads chain behind it (never silently
  // dropped — the advance failure paths MUST land their refetch) but never
  // overlap, so responses can't interleave or land out of order.
  const inflightRef = useRef<Promise<void> | null>(null);
  // Bumped when local truth moves ahead of a started refetch (3.3's advance
  // landing while one is in flight) — the refetch's stale commit is dropped.
  const detailGenRef = useRef(0);
  // The in-flight request's controller, aborted when the screen unmounts.
  const latestControllerRef = useRef<AbortController | null>(null);
  // Flipped on unmount — a chained load must not fire a fresh request after
  // the screen is gone.
  const mountedRef = useRef(true);
  // Set when a 403 lands — the leaving refetch only fires for this case.
  const wasUnassignedRef = useRef(false);
  // The advance hook's error-clearer, called on a fresh refetch commit —
  // stale bar copy must not survive fresh server truth. A ref because load
  // and the advance hook need each other.
  const clearActionErrorRef = useRef<() => void>(() => {});

  const showUnassigned = useCallback((apiError: ApiError) => {
    // Armed on EVERY load and surfaced in every mode — a reassignment
    // mid-session must show the unassigned view whether the 403 lands on
    // mount, on a refresh, or mid-advance.
    wasUnassignedRef.current = true;
    setDetail(null);
    setError(apiError);
  }, []);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!jobId) return;
      const waiting = inflightRef.current;
      if (waiting) {
        await waiting;
        // Only the FIRST chained caller proceeds — if another queued load
        // claimed the slot while we waited, it owns the refresh (and an
        // unmounted screen fires nothing).
        if (!mountedRef.current || (inflightRef.current !== null && inflightRef.current !== waiting)) {
          return;
        }
      }
      const controller = new AbortController();
      latestControllerRef.current = controller;
      const { signal } = controller;
      const gen = detailGenRef.current;
      const request = (async () => {
        // A pull-to-refresh keeps its content on screen (the RefreshControl
        // spinner is feedback enough); only the first load shows the spinner.
        if (showSpinner) {
          setError(null);
        }
        try {
          const fresh = await jobService.getById(jobId, signal);
          // An advance landed while this request was away — the response
          // predates local truth and would silently revert it.
          if (detailGenRef.current !== gen) return;
          setDetail(fresh);
          setError(null);
          clearActionErrorRef.current();
          // Push the ApiJob subset (NO presigned URLs) into the shared store
          // so the list badges (the in-progress/scheduled grouping) stay
          // honest without a list refetch.
          upsertTechnicianJob(apiJobOf(fresh));
        } catch (caught) {
          const apiError = caught as ApiError;
          if (isAbort(apiError, signal)) return;
          if (apiError.status === 403) {
            showUnassigned(apiError);
          } else if (showSpinner) {
            setDetail(null);
            setError(apiError);
          } else {
            // A failed refresh keeps its content on screen — the spinner
            // ending is the only feedback; log so it isn't silent.
            console.warn('[TechJobDetail] refresh failed →', apiError);
          }
        } finally {
          inflightRef.current = null;
        }
      })();
      inflightRef.current = request;
      return request;
    },
    [jobId, showUnassigned],
  );

  // Fetch on mount; the in-flight request is aborted if the screen unmounts.
  useEffect(() => {
    if (!jobId) return;
    void load();
    return () => {
      mountedRef.current = false;
      latestControllerRef.current?.abort();
    };
  }, [load, jobId]);

  // Back that works from anywhere: when this screen is the only route on the
  // stack (deep link), `goBack` would strand the user — reset to the tabs.
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('TechnicianTabs');
    }
  }, [navigation]);

  // Route-params guard: no jobId in the params → leave immediately.
  useEffect(() => {
    if (jobId) return;
    goBackSafely();
  }, [jobId, goBackSafely]);

  // Leaving after a 403: force a Today refetch so the reassigned job's card
  // is gone (or relabelled) by the time the list is visible again. beforeRemove
  // covers both the header back and the hardware/gesture back.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        if (wasUnassignedRef.current) void loadToday({ force: true });
      }),
    [navigation],
  );

  const handleRefresh = useCallback(() => {
    // No busy guard needed: load chains behind an in-flight request and
    // always resolves, so the RefreshControl spinner can't stick.
    setIsRefreshing(true);
    void load(false).finally(() => setIsRefreshing(false));
  }, [load]);

  // 3.3 — one-tap workflow advance (bottom action bar / next stepper row).
  // The hook owns the in-flight step, the idempotency-key lifecycle and the
  // failure branches (`useWorkflowAdvance` header has the race-hardening
  // detail); the screen owns only where those branches route.
  const { pendingStep, actionError, clearActionError, advance } = useWorkflowAdvance({
    jobId,
    detail,
    setDetail,
    detailGenRef,
    load,
    onUnassigned: showUnassigned,
  });
  clearActionErrorRef.current = clearActionError;

  if (!jobId) return null;

  const unassigned = Boolean(error && error.status === 403);
  const notFound = Boolean(error && error.status === 404);
  const failedWithNoDetail = Boolean(error && !detail && !unassigned && !notFound);
  const urgent = detail?.priority === 'urgent';
  const statusBadge = detail ? statusToBadge(detail.status) : null;
  // 3.3 — the bar's content is derived, never stored: it re-derives from the
  // detail on every render (status, current step, activity log). `none`
  // (cancelled) unmounts the bar entirely.
  const action = detail ? actionBarAction(detail, detail.activityLog) : null;
  const barAction = action && action.kind !== 'none' ? action : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <IconButton
          variant="ghost"
          size="md"
          label="Go back"
          onPress={goBackSafely}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
        <Text style={styles.title} numberOfLines={1}>
          {/* Placeholder while loading / on an error view (deep-link safe). */}
          {detail?.jobNumber ?? 'Job'}
        </Text>
        {statusBadge && detail ? (
          <View style={styles.headerBadges}>
            {urgent ? (
              // Urgent borrows the cancelled palette — red communicates
              // urgency without inventing a new status colour.
              <Badge status="cancelled" tone="soft" size="sm">
                Urgent
              </Badge>
            ) : null}
            <Badge status={statusBadge} dot size="sm">
              {STATUS_LABEL[statusBadge] ?? detail.status}
            </Badge>
          </View>
        ) : null}
      </View>

      {unassigned ? (
        <UnassignedView onBack={goBackSafely} />
      ) : notFound ? (
        <NotFoundView onBack={goBackSafely} />
      ) : failedWithNoDetail ? (
        <FailedView
          message={error?.message ?? 'Something went wrong'}
          onRetry={() => void load()}
        />
      ) : !detail ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }>
            <TechJobDetailContent
              detail={detail}
              onAdvance={advance}
              pendingStep={pendingStep}
              // 3.4 — a confirmed photo upload refetches the detail (no
              // spinner): the grid re-renders from server truth, including a
              // fresh read URL for the just-uploaded photo.
              onPhotosConfirmed={() => void load(false)}
            />
          </ScrollView>
          {barAction ? (
            <WorkflowActionBar
              action={barAction}
              pending={pendingStep !== null}
              onAdvance={advance}
              error={actionError}
              onDismissError={clearActionError}
            />
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  // Back header pattern (spec §0): icon button + title@20 + trailing badge,
  // hairline under.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 24,
    color: colors.textStrong,
    flex: 1,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s4,
  },
  // Screen scroll (spec §8): padding s4, gap s4, and a deep bottom inset that
  // clears 3.3's bottom action bar before it exists.
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
    paddingBottom: spacing.s20,
  },
});
