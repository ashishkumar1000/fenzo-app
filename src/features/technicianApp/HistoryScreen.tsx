/**
 * HistoryScreen — the technician's "History" tab: completed and cancelled
 * jobs, newest first (server order), cursor-paginated with a footer spinner
 * on load-more. Data comes from the same `useTechnicianJobs` store as Today,
 * so the two tabs can never disagree. Cards are the JobCard technician
 * variant: no footer, service-type label as the title line.
 *
 * No All / This week / This month filters — nothing to filter until there's
 * real history volume, and they're easy to add back once there is.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { History as HistoryIcon } from 'lucide-react-native';
import { Button, EmptyState, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import { JobCard } from '../jobs/components/JobCard';
import type { ApiJob } from '../jobs/types';
import { loadHistory, loadMoreHistory, useTechnicianJobs } from './useTechnicianJobs';
import type { TechnicianRootStackParamList } from '../../navigation/types';

export default function HistoryScreen() {
  const {
    history,
    isLoadingHistory,
    isLoadingMore,
    errorHistory,
    hasLoadedHistory,
    historyHasMore,
    refreshHistory,
  } = useTechnicianJobs();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<TechnicianRootStackParamList>>();

  // A failed refresh keeps its rows on screen behind a dismissible banner;
  // the dismissal is local (the store's error clears on the next attempt).
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [errorHistory]);

  // Refetch on every focus — the store throttles (skips within 15s of a
  // success), so tab-hopping stays cheap.
  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, []),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshHistory();
    setIsRefreshing(false);
  }, [refreshHistory]);

  const handleOpenJob = useCallback(
    (job: ApiJob) => {
      navigation.navigate('TechJobDetail', { jobId: job.id });
    },
    [navigation],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      {isLoadingHistory && !hasLoadedHistory ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : errorHistory && !hasLoadedHistory ? (
        <View style={styles.centered}>
          {/* No onDismiss: with nothing on screen an X would only hide the
              message while the store still holds the error — Retry is the
              way out, so this banner stays non-dismissible. */}
          <InlineError message={errorHistory} />
          <Button variant="secondary" size="md" onPress={() => void refreshHistory()}>
            Retry
          </Button>
        </View>
      ) : (
        <>
          {/* A failed refresh with rows already on screen: keep the rows,
              explain why they may be stale. */}
          {errorHistory && hasLoadedHistory && !errorDismissed ? (
            <View style={styles.bannerWrap}>
              <InlineError message={errorHistory} onDismiss={() => setErrorDismissed(true)} />
            </View>
          ) : null}
          <FlatList
          data={history}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <JobCard job={item} scope="history" showFooter={false} onPress={handleOpenJob} />
          )}
          onEndReached={() => void loadMoreHistory()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footerSpinner}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          contentContainerStyle={[
            styles.listContent,
            !hasLoadedHistory || history.length === 0 ? styles.listContentEmpty : null,
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void handleRefresh()}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<HistoryIcon size={36} color={colors.primary} strokeWidth={1.5} />}
              title="No past jobs yet"
              description="Completed and cancelled jobs will show up here."
            />
          }
        />
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
  header: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s3,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  listContent: {
    padding: spacing.s4,
  },
  listContentEmpty: {
    flexGrow: 1,
    // When empty: flexGrow gives EmptyState's `flex: 1` a height to centre
    // itself in, and the list padding drops away since EmptyState brings its
    // own horizontal inset.
    padding: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  footerSpinner: {
    paddingVertical: spacing.s4,
  },
  separator: {
    height: spacing.s3,
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
});