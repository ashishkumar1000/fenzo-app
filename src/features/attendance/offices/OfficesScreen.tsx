/**
 * OfficesScreen — the owner's attendance offices (Story 15-4, FR-5).
 *
 * Entry point: the More tab's "Offices" row. Full list fetch (no pagination
 * — locked scope decision), split into active rows and archived rows behind
 * an "Archived" disclosure. A client-side name filter appears once the
 * ACTIVE list exceeds ~8 rows (offices are physical branches — tens per
 * tenant, so a filter box before that is clutter).
 *
 * A tap on an active row opens the edit form; "Add office" opens the form
 * empty. First-run owners (a 15-2 setup needs at least one office) land on
 * the empty state, whose CTA is the same Add.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp, MapPin, Search, Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import {
  Button,
  EmptyState,
  IconButton,
  InlineError,
  Input,
} from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { useOffices } from './useOffices';
import OfficeListRow from './OfficeListRow';
import ScreenHeader from './ScreenHeader';

/** The name filter appears only past this many ACTIVE rows. */
const SEARCH_THRESHOLD = 8;

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceOffices'>;

export default function OfficesScreen({ navigation }: Props) {
  const { activeOffices, archivedOffices, isLoading, hasLoaded, error, refresh } =
    useOffices();
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
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
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
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
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

          {filteredActive.length === 0 && needle ? (
            <Text style={styles.emptyFilter}>No offices match "{query.trim()}"</Text>
          ) : (
            filteredActive.map((office) => (
              <OfficeListRow
                key={office.id}
                office={office}
                onPress={() => openForm(office.id)}
              />
            ))
          )}

          {archivedOffices.length > 0 ? (
            <View style={styles.archivedBlock}>
              <Text style={styles.sectionLabel}>Archived</Text>
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
          ) : null}
          {showArchived
            ? filteredArchived.map((office) => (
                <OfficeListRow key={office.id} office={office} />
              ))
            : null}
          {showArchived && filteredArchived.length === 0 && needle ? (
            <Text style={styles.emptyFilter}>No archived offices match "{query.trim()}"</Text>
          ) : null}

          <Button
            variant="secondary"
            leadingIcon={<Plus size={16} color={colors.primary} strokeWidth={2} />}
            onPress={() => openForm()}>
            Add office
          </Button>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.s4,
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
});
