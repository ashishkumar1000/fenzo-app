/**
 * JobDetailScreen — full-screen route for one job: everything about it on a
 * single scroll (header card, actions slot, customer, technician, photos &
 * signature, activity), fetched fresh on every open.
 *
 * The detail is screen-local state, deliberately NOT a shared store: the
 * attachments' presigned URLs are 1-hour, regenerated per call and may be
 * null — a refetch is the only retry for a null/expired URL, so the detail is
 * re-fetched on open (and on pull-to-refresh) and never cached (Dev Notes).
 *
 * A 404 (missing/cross-tenant) or 403 (technician not assigned — owners
 * shouldn't hit it) renders the friendly not-available view; other failures
 * get an inline error with Retry.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar,
  ChevronLeft,
  Clock,
  FileQuestion,
  MapPin,
  Wrench,
} from 'lucide-react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  InlineError,
} from '../../components/ui';
import { colors, spacing, touch, typography } from '../../theme';
import { jobService } from '../../services';
import type { ApiError, ApiJob, JobDetail } from '../../services';
import type { RootStackParamList } from '../../navigation/types';
import { upsertJob } from '../jobs';
import { loadMyProfile, useMyProfile } from '../profile';
import { flattenApiMessage } from './editJobModel';
import { PersonRow } from './components/PersonRow';
import { ActivityTimeline } from './components/ActivityTimeline';
import { AttachmentGrid } from './components/AttachmentGrid';
import { EditJobSheet } from './components/EditJobSheet';
import { SectionCard } from './components/SectionCard';
import { STEP_LABELS, STEP_ORDER, stepNumber } from './eventLabels';
import { formatTimeLabel, serviceTypeLabel, statusToBadge } from '../jobs/format';
import { formatPhone } from '../profile';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'JobDetail'>;

/** Badge labels — the one title-case exception in the design system. */
const STATUS_LABEL = {
  done: 'Done',
  progress: 'In Progress',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
} as const;

/** "12 Aug 2026" — the date line's format (spec §0). Unparseable input → raw. */
function dateLine(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

export default function JobDetailScreen() {
  const navigation = useNavigation<Navigation>();
  // Route-params guard: a deep link that lands here without a jobId has
  // nothing to show — pop back (or to the tabs) instead of crashing.
  const jobId = useRoute<RouteProp<RootStackParamList, 'JobDetail'>>().params?.jobId;

  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Edit sheet. Technicians come from the shared profile store (`/users/me`)
  // — the only source of server-issued ids safe to send on a reassign.
  const { profile } = useMyProfile();
  const [isEditOpen, setIsEditOpen] = useState(false);

  // One request at a time: a retry/refresh is ignored while a fetch is in
  // flight, so responses can't interleave or land out of order.
  const isBusyRef = useRef(false);
  // The in-flight request's controller, aborted when the screen unmounts —
  // so refresh/retry requests are cancelled too, not just the first load.
  const latestControllerRef = useRef<AbortController | null>(null);

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
        setIsLoading(true);
        setError(null);
      }
      try {
        setDetail(await jobService.getById(jobId, signal));
      } catch (caught) {
        const apiError = caught as ApiError;
        if (isAbort(apiError, signal)) return;
        if (showSpinner) {
          setDetail(null);
          setError(apiError);
        } else {
          // A failed refresh keeps its content on screen (spec §3) — the
          // spinner ending is the only feedback; log so it isn't silent.
          console.warn('[JobDetail] refresh failed →', apiError);
        }
      } finally {
        setIsLoading(false);
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
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // Route-params guard: no jobId in the params → leave immediately.
  useEffect(() => {
    if (jobId) return;
    goBackSafely();
  }, [jobId, goBackSafely]);

  const handleRefresh = useCallback(() => {
    // Busy guard here too, so a swallowed refresh can't leave the
    // RefreshControl spinner stuck on.
    if (isBusyRef.current) return;
    setIsRefreshing(true);
    void load(false).finally(() => setIsRefreshing(false));
  }, [load]);

  /**
   * Applies a successful mutation (edit save or cancel) everywhere at once:
   * the detail (response merged over the existing detail, so technician/
   * customer/log/attachments survive until the refetch), the jobs-list store,
   * and the profile store (status counts). Also refires the roster load —
   * the shared store de-duplicates the request.
   */
  const applyJobUpdate = useCallback((updated: ApiJob) => {
    setDetail(prev => (prev ? { ...prev, ...updated } : prev));
    upsertJob(updated);
    void loadMyProfile();
  }, []);

  const handleEditSaved = useCallback(
    (updated: ApiJob) => applyJobUpdate(updated),
    [applyJobUpdate],
  );

  const handleEditClosed = useCallback(() => {
    setIsEditOpen(false);
    // Silent refetch on close: after a save it renews the activity log, and
    // after a "job already started" close it shows the new status — the
    // busy guard makes overlapping calls harmless.
    void load(false);
  }, [load]);

  // Cancel PATCHes can't be deduplicated server-side — a double-tap on the
  // confirm button must not fire the request twice.
  const isCancellingRef = useRef(false);

  const handleCancelJob = useCallback(async () => {
    if (!detail || isCancellingRef.current) return;
    isCancellingRef.current = true;
    try {
      const updated = await jobService.update(detail.id, { status: 'cancelled' });
      applyJobUpdate(updated);
      void load(false);
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.code === 'JOB_NOT_MODIFIABLE') {
        // The job started between opening the dialog and confirming — the
        // refreshed detail shows why the cancel didn't happen.
        void load(false);
        return;
      }
      // The confirm dialog is long gone by now — a failed cancel must be
      // visible, not a console.warn. Reuse the alert so the feedback lands
      // where the user's attention already is.
      Alert.alert(
        "Couldn't cancel the job",
        flattenApiMessage(apiError.message) || 'Please try again.',
      );
    } finally {
      isCancellingRef.current = false;
    }
  }, [applyJobUpdate, detail, load]);

  const confirmCancel = useCallback(() => {
    Alert.alert('Cancel job', 'The technician will no longer see this job.', [
      { text: 'Keep job', style: 'cancel' },
      { text: 'Cancel job', style: 'destructive', onPress: () => void handleCancelJob() },
    ]);
  }, [handleCancelJob]);

  if (!jobId) return null;

  const notFound = Boolean(error && (error.status === 404 || error.status === 403));
  const failedWithNoDetail = Boolean(error && !detail && !notFound);
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
          {detail?.jobNumber ?? 'Job details'}
        </Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <EmptyState
            icon={<FileQuestion size={36} color={colors.primary} strokeWidth={1.5} />}
            title="This job isn't available"
            description="It may have been removed or reassigned."
          />
          <Button variant="secondary" size="md" onPress={goBackSafely}>
            Go back
          </Button>
        </View>
      ) : failedWithNoDetail ? (
        <View style={styles.centered}>
          <InlineError message={error?.message ?? 'Something went wrong'} />
          <Button variant="secondary" size="md" onPress={() => void load()}>
            Retry
          </Button>
        </View>
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
          {/* 1. Header card: badges → service line → meta rows → progress →
              description / notes behind dividers. */}
          <Card padding="md" style={styles.headerCard}>
            <View style={styles.badgeRow}>
              {urgent ? (
                // Urgent borrows the cancelled palette — red communicates
                // urgency without inventing a new status colour.
                <Badge status="cancelled" tone="soft" size="sm">
                  Urgent
                </Badge>
              ) : null}
              {statusBadge ? (
                <Badge status={statusBadge} dot>
                  {STATUS_LABEL[statusBadge] ?? detail.status}
                </Badge>
              ) : null}
            </View>
            <Text style={styles.serviceLabel} numberOfLines={1}>
              {serviceTypeLabel(detail.serviceType)}
            </Text>

            <View style={styles.metaRow}>
              <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.metaText}>{dateLine(detail.scheduledStart)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Clock size={15} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.metaText}>
                {formatTimeLabel(detail.scheduledStart, detail.scheduledEnd)}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <MapPin size={15} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.metaText} numberOfLines={1}>
                {detail.serviceLocation}
              </Text>
            </View>

            {detail.status === 'in_progress' &&
            detail.currentStep !== null &&
            // An unknown step has no position — "Step 0 of 6" would be a lie,
            // so the line stays hidden rather than rendering nonsense.
            stepNumber(detail.currentStep) !== 0 ? (
              // "Step N of 6 — <label>" only while the work is actually
              // under way; a fresh job has no current step to show.
              <Text style={styles.progressLine}>
                {`Step ${stepNumber(detail.currentStep)} of ${STEP_ORDER.length} — ${
                  STEP_LABELS[detail.currentStep] ?? detail.currentStep
                }`}
              </Text>
            ) : null}

            {detail.description ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.bodyText}>{detail.description}</Text>
              </>
            ) : null}
            {detail.notesForTechnician ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.notesLabel}>Notes for technician</Text>
                <Text style={styles.bodyText}>{detail.notesForTechnician}</Text>
              </>
            ) : null}
          </Card>

          {/* 2. Actions slot — edit + cancel for scheduled jobs only; every
              other status renders nothing here. */}
          {detail.status === 'scheduled' ? (
            <View testID="job-detail-actions" style={styles.actionsRow}>
              <Button
                variant="secondary"
                size="md"
                style={styles.editButton}
                onPress={() => setIsEditOpen(true)}>
                Edit job
              </Button>
              <Button
                variant="ghost"
                size="md"
                labelColor={colors.danger}
                onPress={confirmCancel}>
                Cancel job
              </Button>
            </View>
          ) : (
            <View testID="job-detail-actions" />
          )}

          {/* 3. Customer */}
          <SectionCard title="Customer">
            <PersonRow
              name={detail.customer.name}
              countryCode={detail.customer.countryCode}
              phoneNumber={detail.customer.phoneNumber}
              subLine={formatPhone(detail.customer)}
            />
            {detail.customer.address ? (
              <View style={styles.sectionMetaRow}>
                <MapPin size={15} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.metaText} numberOfLines={2}>
                  {[detail.customer.address, detail.customer.city]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              </View>
            ) : null}
          </SectionCard>

          {/* 4. Technician */}
          <SectionCard title="Technician">
            <PersonRow
              name={detail.technician.name}
              countryCode={detail.technician.countryCode}
              phoneNumber={detail.technician.phoneNumber}
              subLine={formatPhone(detail.technician)}
            />
            {detail.technician.skills.length ? (
              <View style={styles.sectionMetaRow}>
                <Wrench size={15} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.metaText} numberOfLines={2}>
                  {detail.technician.skills.join(', ')}
                </Text>
              </View>
            ) : null}
          </SectionCard>

          {/* 5. Photos & signature — only when the job has attachments. */}
          {detail.attachments.length ? (
            <SectionCard title="Photos & signature">
              <AttachmentGrid attachments={detail.attachments} />
            </SectionCard>
          ) : null}

          {/* 6. Activity — oldest-first timeline; nothing logged yet → no card. */}
          {detail.activityLog.length ? (
            <SectionCard title="Activity">
              <ActivityTimeline entries={detail.activityLog} />
            </SectionCard>
          ) : null}
        </ScrollView>

        {isEditOpen ? (
          <EditJobSheet
            visible={isEditOpen}
            job={detail}
            technicians={profile?.technicians ?? []}
            onClose={handleEditClosed}
            onSaved={handleEditSaved}
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
  // Back header pattern (spec §0): icon button + title@20, hairline under.
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  // Card §0: internal gap s2 (same as JobCard).
  headerCard: {
    gap: spacing.s2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  // Actions slot (§5): Edit takes the width, Cancel sits beside it as
  // destructive text.
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  editButton: {
    flex: 1,
  },
  serviceLabel: {
    ...typography.heading,
    color: colors.textStrong,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  metaText: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  progressLine: {
    ...typography.labelStrong,
    color: colors.status.progress.fg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginTop: spacing.s1,
  },
  bodyText: {
    ...typography.body,
    color: colors.textBody,
  },
  notesLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  // Extra air between a PersonRow and the meta rows below it in a section.
  sectionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: touch.min,
    marginTop: spacing.s2,
  },
});