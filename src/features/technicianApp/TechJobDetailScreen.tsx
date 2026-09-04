/**
 * TechJobDetailScreen — the technician's one-screen view of a job, fetched
 * fresh on every open (the attachments' presigned URLs are 1-hour and
 * regenerated per call — a refetch is the only retry, so the detail is
 * never cached, matching the owner detail's reasoning).
 *
 * This file owns state only: fetch/single-flight/abort, the back header,
 * the pull-to-refresh, and which view to show (error states vs the loaded
 * content, which lives in `TechJobDetailContent`).
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
import type { ApiError, ApiJob, JobDetail } from '../../services';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import { loadToday, upsertTechnicianJob } from './useTechnicianJobs';
import { statusToBadge } from '../jobs/format';
import { FailedView, NotFoundView, UnassignedView } from './components/DetailErrorViews';
import { TechJobDetailContent } from './components/TechJobDetailContent';

type Navigation = NativeStackNavigationProp<TechnicianRootStackParamList, 'TechJobDetail'>;

/** Badge labels — the one title-case exception in the design system. */
const STATUS_LABEL = {
  done: 'Done',
  progress: 'In Progress',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
} as const;

/**
 * The list-store row for a freshly fetched detail — the ApiJob fields ONLY.
 * The detail's embedded technician/customer profiles, activity log and
 * attachments (whose presigned URLs are 1-hour and must never be persisted)
 * are stripped before anything lands in the shared store.
 */
function apiJobOf(detail: JobDetail): ApiJob {
  const {
    technician: _technician,
    customer: _customer,
    activityLog: _activityLog,
    attachments: _attachments,
    ...row
  } = detail;
  return row;
}

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

  // One request at a time: a retry/refresh is ignored while a fetch is in
  // flight, so responses can't interleave or land out of order.
  const isBusyRef = useRef(false);
  // The in-flight request's controller, aborted when the screen unmounts.
  const latestControllerRef = useRef<AbortController | null>(null);
  // Set when a 403 lands — the leaving refetch only fires for this case.
  const wasUnassignedRef = useRef(false);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!jobId || isBusyRef.current) return;
      isBusyRef.current = true;
      const controller = new AbortController();
      latestControllerRef.current = controller;
      const { signal } = controller;
      // A pull-to-refresh keeps its content on screen (the RefreshControl
      // spinner is feedback enough); only the first load shows the spinner.
      if (showSpinner) {
        setError(null);
      }
      try {
        const fresh = await jobService.getById(jobId, signal);
        setDetail(fresh);
        setError(null);
        // Push the ApiJob subset (NO presigned URLs) into the shared store so
        // the list badges (the in-progress/scheduled grouping) stay honest
        // without a list refetch.
        upsertTechnicianJob(apiJobOf(fresh));
      } catch (caught) {
        const apiError = caught as ApiError;
        if (isAbort(apiError, signal)) return;
        if (apiError.status === 403) {
          // Armed on EVERY load and surfaced in every mode — a reassignment
          // mid-session must show the unassigned view whether the 403 lands
          // on mount or on a refresh.
          wasUnassignedRef.current = true;
          setDetail(null);
          setError(apiError);
        } else if (showSpinner) {
          setDetail(null);
          setError(apiError);
        } else {
          // A failed refresh keeps its content on screen — the spinner
          // ending is the only feedback; log so it isn't silent.
          console.warn('[TechJobDetail] refresh failed →', apiError);
        }
      } finally {
        isBusyRef.current = false;
      }
    },
    [jobId],
  );

  // Fetch on mount; the in-flight request is aborted if the screen unmounts.
  useEffect(() => {
    if (!jobId) return;
    void load();
    return () => latestControllerRef.current?.abort();
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
    // Busy guard here too, so a swallowed refresh can't leave the
    // RefreshControl spinner stuck on.
    if (isBusyRef.current) return;
    setIsRefreshing(true);
    void load(false).finally(() => setIsRefreshing(false));
  }, [load]);

  if (!jobId) return null;

  const unassigned = Boolean(error && error.status === 403);
  const notFound = Boolean(error && error.status === 404);
  const failedWithNoDetail = Boolean(error && !detail && !unassigned && !notFound);
  const urgent = detail?.priority === 'urgent';
  const statusBadge = detail ? statusToBadge(detail.status) : null;

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
          <TechJobDetailContent detail={detail} />
        </ScrollView>
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
