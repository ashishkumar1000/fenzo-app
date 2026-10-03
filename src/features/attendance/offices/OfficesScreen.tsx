/**
 * OfficesScreen — the owner's attendance offices (Story 15-4, reshaped to
 * the user-approved sample design 2026-09-28): a segmented All/Active/
 * Archived filter with counts, sample cards (OfficeListRow), and a
 * full-width primary "Add new office" CTA (top of the list — user request
 * 2026-09-28: it now leads the screen, above the segment tabs).
 *
 * Behaviour unchanged from the reviewed 15-4 screen: full list fetch (no
 * pagination), a client-side name filter once ACTIVE rows exceed ~8, taps
 * on active rows open the edit form, archived rows stay read-only (15-3:
 * archived offices never unarchive — the sample's Restore button has no
 * backend), and first-run owners land on the empty state.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp, MapPin, Plus, Search } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import {
  Button,
  EmptyState,
  IconButton,
  InlineError,
  Input,
  Skeleton,
} from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { useOffices } from './useOffices';
import OfficeListRow from './OfficeListRow';
import ScreenHeader from './ScreenHeader';

/** The name filter appears only past this many ACTIVE rows. */
const SEARCH_THRESHOLD = 8;

import { OfficeSegmentTabs, type OfficeSegment } from './OfficeSegmentTabs';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceOffices'>;

export default function OfficesScreen({ navigation }: Props) {
  const { activeOffices, archivedOffices, isLoading, hasLoaded, error, refresh } =
    useOffices();
  const [segment, setSegment] = useState<OfficeSegment>('all');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const showSearch = activeOffices.length > SEARCH_THRESHOLD;
  // The needle only filters while the search box is on screen — if the
  // active rows drop back under the threshold, the input unmounts and a
  // still-applied needle would silently hide rows with no way to clear it.
  const needle = showSearch ? query.trim().toLowerCase() : '';
  const filteredActive = useMemo(
    () =>
      needle
        ? activeOffices.filter((office) => office.name.toLowerCase().includes(needle))
        : activeOffices,
    [activeOffices, needle],
  );
  const filteredArchived = useMemo(
    () =>
      needle
        ? archivedOffices.filter((office) => office.name.toLowerCase().includes(needle))
        : archivedOffices,
    [archivedOffices, needle],
  );

  const openForm = (officeId?: string) =>
    navigation.navigate('OfficeForm', { officeId });

  // Pull-to-refresh (the 15-6 idiom) — announced to screen readers.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
      AccessibilityInfo.announceForAccessibility('Offices updated');
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshing]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Offices" onBack={() => navigation.goBack()} />

      {/* A background refetch failure must not read as success — the last
          loaded rows stay visible, with the failure announced above them. */}
      {error && hasLoaded ? (
        <View style={styles.noticeWrap}>
          <InlineError message="Couldn't refresh offices. Showing the last loaded list." />
        </View>
      ) : null}

      {isLoading && !hasLoaded ? (
        // First load: a list-shaped shimmer, labelled (the 19-5 idiom).
        <View style={styles.content} accessibilityLabel="Loading attendance">
          <Skeleton rows={4} height={80} />
        </View>
      ) : error && !hasLoaded ? (
        <View style={styles.content}>
          <InlineError message="Couldn't load offices. Check your connection and try again." />
          <Button variant="secondary" onPress={refresh}>
            Retry
          </Button>
        </View>
      ) : activeOffices.length === 0 && archivedOffices.length === 0 ? (
        <View style={styles.content}>
          <EmptyState
            icon={<MapPin size={24} color={colors.primary} strokeWidth={1.5} />}
            title="No offices yet"
            description="Add your first office to start tracking attendance. You'll place its pin on a map."
            ctaLabel="Add office"
            ctaIcon={<Plus size={16} color={colors.onPrimary} strokeWidth={2} />}
            onPressCta={() => openForm()}
          />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          // Virtualized rows: the ACTIVE list is the growth axis (branches
          // accumulate over time); the archived block stays behind its
          // disclosure in the footer, where hand-scale rendering is fine.
          data={segment === 'archived' ? filteredArchived : filteredActive}
          keyExtractor={(office) => office.id}
          renderItem={({ item }) =>
            segment === 'archived' ? (
              <OfficeListRow office={item} />
            ) : (
              <OfficeListRow
                office={item}
                onPress={() => openForm(item.id)}
              />
            )
          }
          ListEmptyComponent={
            needle ? (
              <Text style={styles.emptyFilter}>
                No {segment === 'archived' ? 'archived ' : ''}offices match "{query.trim()}"
              </Text>
            ) : (
              <></>
            )
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {/* The sample's full-width primary CTA. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add new office"
                onPress={() => openForm()}
                style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
                <View style={styles.ctaIcon}>
                  <Plus size={20} color={colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.ctaTexts}>
                  <Text style={styles.ctaTitle}>Add new office</Text>
                  <Text style={styles.ctaSubtitle}>Set the check-in area &amp; shift hours</Text>
                </View>
              </Pressable>
              <OfficeSegmentTabs
                segment={segment}
                activeCount={activeOffices.length}
                archivedCount={archivedOffices.length}
                onSelect={setSegment}
              />

              {showSearch ? (
                <Input
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search offices..."
                  autoCapitalize="none"
                  autoCorrect={false}
                  leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
                />
              ) : null}
            </View>
          }
          ListFooterComponent={
            <View style={styles.listFooter}>
              {segment === 'all' && archivedOffices.length > 0 ? (
                <>
                  <View style={styles.archivedBlock}>
                    <Text style={styles.sectionLabel}>
                      Archived ({archivedOffices.length})
                    </Text>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      label={showArchived ? 'Hide archived offices' : 'Show archived offices'}
                      onPress={() => setShowArchived((shown) => !shown)}>
                      {showArchived ? (
                        <ChevronUp size={16} color={colors.textMuted} strokeWidth={2} />
                      ) : (
                        <ChevronDown size={16} color={colors.textMuted} strokeWidth={2} />
                      )}
                    </IconButton>
                  </View>
                  {showArchived
                    ? filteredArchived.map((office) => (
                        <OfficeListRow key={office.id} office={office} />
                      ))
                    : null}
                </>
              ) : null}

            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
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
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  listHeader: {
    gap: spacing.s3,
  },
  listFooter: {
    gap: spacing.s3,
  },
  noticeWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  emptyFilter: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.s4,
  },
  archivedBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.s2,
  },
  sectionLabel: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textMuted,
    flex: 1,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginTop: spacing.s2,
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  ctaTitle: {
    ...typography.heading,
    color: colors.onPrimary,
  },
  ctaSubtitle: {
    ...typography.caption,
    color: colors.onPrimary,
    opacity: 0.8,
  },
});
