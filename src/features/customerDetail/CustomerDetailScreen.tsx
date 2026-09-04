/**
 * CustomerDetailScreen — full-screen route for one customer: profile card
 * plus their job history, fetched fresh on every open and silently refetched
 * on focus (a status changed inside JobDetail must not look stale on the way
 * back).
 *
 * Owner-only endpoint (a technician JWT gets 403), so the screen lives only
 * in the owner's nav tree — no role branching.
 *
 * The detail is screen-local state, deliberately NOT a shared store: like the
 * job detail (Story 1.2), a refetch is the only path to current data and a
 * 404 (missing/cross-tenant) has a dedicated view anyway. History pages are
 * appended client-side and keyed by the row's `id`, so the same page fetched
 * twice (refresh racing load-more) can't duplicate a row.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Briefcase,
  ChevronLeft,
  FileQuestion,
  MapPin,
  Phone,
} from 'lucide-react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  IconButton,
  InlineError,
} from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { customerService } from '../../services';
import type { ApiError, CustomerDetail, JobHistoryItem } from '../../services';
import type { RootStackParamList } from '../../navigation/types';
import { customerLocation, customerPhone } from '../customers/format';
import { openTel } from '../../utils/linking';
import { HistoryRow } from './components/HistoryRow';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'CustomerDetail'>;

/** "12 Aug 2026" — the "Customer since" caption's format (spec §6/§15). */
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

export default function CustomerDetailScreen() {
  const navigation = useNavigation<Navigation>();
  // Route-params guard: a deep link that lands here without a customerId has
  // nothing to show — pop back (or to the tabs) instead of crashing.
  const customerId = useRoute<RouteProp<RootStackParamList, 'CustomerDetail'>>()
    .params?.customerId;

  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [rows, setRows] = useState<JobHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // One request at a time: a retry/refresh/load-more is ignored while a fetch
  // is in flight, so responses can't interleave, land out of order, or append
  // the same page twice.
  const isBusyRef = useRef(false);
  // The in-flight request's controller, aborted when the screen unmounts —
  // so refresh/retry/load-more requests are cancelled too.
  const latestControllerRef = useRef<AbortController | null>(null);
  // Flips true after the first successful load — the focus effect below uses
  // it to skip the screen's initial focus (the mount fetch covers that one).
  const hasLoadedRef = useRef(false);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!customerId || isBusyRef.current) return;
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
        const page = await customerService.getById(customerId, undefined, signal);
        setDetail(page);
        setRows(page.jobHistory.data);
        setCursor(page.jobHistory.nextCursor);
        setHasMore(page.jobHistory.hasMore);
        hasLoadedRef.current = true;
      } catch (caught) {
        const apiError = caught as ApiError;
        if (isAbort(apiError, signal)) return;
        if (showSpinner) {
          setDetail(null);
          setRows([]);
          setCursor(null);
          setHasMore(false);
          setError(apiError);
        } else {
          // A failed refresh keeps its content on screen (spec §3) — the
          // spinner ending is the only feedback; log so it isn't silent.
          console.warn('[CustomerDetail] refresh failed →', apiError);
        }
      } finally {
        setIsLoading(false);
        isBusyRef.current = false;
      }
    },
    [customerId],
  );

  // Fetch on mount; the in-flight request is aborted if the screen unmounts.
  useEffect(() => {
    if (!customerId) return;
    void load();
    return () => latestControllerRef.current?.abort();
  }, [load, customerId]);

  // Silent refetch on focus: coming back from JobDetail (e.g. after a status
  // change) must not show stale history. Only after a first load succeeded —
  // the mount fetch covers the initial focus; the busy guard makes an overlap
  // with a pull-to-refresh or load-more harmless, and the refetch resets the
  // pagination to page 1 (same as pull-to-refresh).
  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) void load(false);
    }, [load]),
  );

  // Back that works from anywhere: when this screen is the only route on the
  // stack (deep link), `goBack` would strand the user — reset to the tabs.
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // Route-params guard: no customerId in the params → leave immediately.
  useEffect(() => {
    if (customerId) return;
    goBackSafely();
  }, [customerId, goBackSafely]);

  const handleRefresh = useCallback(() => {
    // Busy guard here too, so a swallowed refresh can't leave the
    // RefreshControl spinner stuck on.
    if (isBusyRef.current) return;
    setIsRefreshing(true);
    void load(false).finally(() => setIsRefreshing(false));
  }, [load]);

  const handleLoadMore = useCallback(async () => {
    if (!customerId || !hasMore || !cursor || isBusyRef.current) return;
    isBusyRef.current = true;
    setIsLoadingMore(true);
    const controller = new AbortController();
    latestControllerRef.current = controller;
    try {
      const page = await customerService.getById(customerId, cursor, controller.signal);
      // Dedupe by id: a refresh that raced this load-more could already have
      // appended the same page, and a page could repeat an id within itself —
      // a row fetched twice renders once either way.
      setRows(prev => {
        const seen = new Set(prev.map(row => row.id));
        return [
          ...prev,
          ...page.jobHistory.data.filter(row => {
            if (seen.has(row.id)) return false;
            seen.add(row.id);
            return true;
          }),
        ];
      });
      setCursor(page.jobHistory.nextCursor);
      setHasMore(page.jobHistory.hasMore);
    } catch (caught) {
      // A failed load-more keeps the rows on screen (spec §3); the footer
      // spinner ending is the only feedback, so log rather than surface an
      // error banner — the user can pull-to-refresh to start over.
      console.warn('[CustomerDetail] load-more failed →', caught);
    } finally {
      setIsLoadingMore(false);
      isBusyRef.current = false;
    }
  }, [customerId, hasMore, cursor]);

  const handleOpenJob = useCallback(
    (item: JobHistoryItem) => {
      navigation.navigate('JobDetail', { jobId: item.id });
    },
    [navigation],
  );

  const renderHeader = useCallback(() => {
    if (!detail) return null;
    const location = customerLocation(detail);
    return (
      <View>
        <Card padding="md" style={styles.profileCard}>
          <View style={styles.identityRow}>
            <Avatar name={detail.name} size="lg" />
            <View style={styles.identity}>
              <Text style={styles.name} numberOfLines={1}>
                {detail.name}
              </Text>
            </View>
            <IconButton
              variant="ghost"
              size="md"
              label={`Call ${detail.name}`}
              onPress={() => void openTel(detail.countryCode, detail.phoneNumber)}>
              <Phone size={18} color={colors.primary} strokeWidth={2} />
            </IconButton>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{customerPhone(detail)}</Text>
          </View>
          {location ? (
            <View style={styles.metaRow}>
              <MapPin size={15} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.metaText} numberOfLines={1}>
                {location}
              </Text>
            </View>
          ) : null}
          <Text style={styles.sinceCaption}>Customer since {dateLine(detail.createdAt)}</Text>
        </Card>

        <Text style={styles.sectionTitle}>Job history</Text>
      </View>
    );
  }, [detail]);

  const notFound = Boolean(error && (error.status === 404 || error.status === 403));
  const failedWithNoDetail = Boolean(error && !detail && !notFound);

  if (!customerId) return null;

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
          {detail?.name ?? 'Customer'}
        </Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <EmptyState
            icon={<FileQuestion size={36} color={colors.primary} strokeWidth={1.5} />}
            title="This customer isn't available"
            description="It may have been removed or is from another company."
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
      ) : isLoading || !detail ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <HistoryRow item={item} onPress={handleOpenJob} />
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <EmptyState
              icon={<Briefcase size={36} color={colors.primary} strokeWidth={1.5} />}
              title="No jobs yet"
              description="Jobs for this customer will appear here."
            />
          }
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.content}
          onEndReached={() => void handleLoadMore()}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
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
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
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
  },
  content: {
    padding: spacing.s4,
  },
  profileCard: {
    gap: spacing.s2,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  identity: {
    flex: 1,
  },
  name: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 24,
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
  sinceCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  sectionTitle: {
    ...typography.heading,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textStrong,
    marginTop: spacing.s4,
    marginBottom: spacing.s3,
  },
  separator: {
    height: spacing.s3,
  },
  footer: {
    paddingVertical: spacing.s4,
  },
});