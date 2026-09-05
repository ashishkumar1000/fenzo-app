/**
 * AddressPickerScreen — full-screen route (pushed over whatever screen
 * opened it) for searching and resolving a real address via
 * `useAddressAutosuggest`.
 *
 * Header/back follows `NewJobScreen`'s pattern verbatim, except the title
 * slot is replaced by an auto-focused search `Input`. Suggestion rows reuse
 * `TechnicianPicker`'s row-card style verbatim, with a `MapPin` leading icon
 * instead of an avatar and a spinner in place of a check mark while a row is
 * resolving.
 *
 * Implements the epic's 8 states in strict precedence (see
 * `useAddressAutosuggest`'s `phase`): Idle → Below-threshold → Loading →
 * Results → No-results → Error → Resolving → Resolve-failed.
 *
 * On a successful resolve, navigates back to `returnRouteName` with
 * `{ pendingAddress: ResolvedPlace }` merged into its params. Back gesture,
 * header chevron, and the "Enter manually" CTA are all plain no-op cancels
 * (`navigation.goBack()`) — nothing destructive happens by leaving, so none
 * of them need a confirmation.
 *
 * Wiring the tap-to-open trigger and reading `pendingAddress` back is
 * Story 1.5 — this screen is not yet reachable from the live UI.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState, InlineError, Input } from '../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import type { PlaceSuggestion } from '../../services';
import { useAddressAutosuggest } from './useAddressAutosuggest';

type Props = NativeStackScreenProps<RootStackParamList, 'AddressPicker'>;

export default function AddressPickerScreen({ navigation, route }: Props) {
  const { returnRouteName } = route.params;
  const {
    query,
    setQuery,
    phase,
    suggestions,
    errorMessage,
    resolvingPlaceId,
    retry,
    resolvePlace,
  } = useAddressAutosuggest();

  // Whole screen non-interactive while a resolve is in flight — the header
  // back button and search input included, not just the tapped row.
  const isInteractive = phase !== 'resolving';

  // The header chevron's `disabled` prop only stops a tap on that button —
  // it does nothing about the iOS swipe-back gesture or the Android
  // hardware back button, both of which would otherwise dismiss the screen
  // out from under an in-flight resolve. Disabling the gesture here keeps
  // that promise for every way off the screen, not just the visible button.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: isInteractive });
  }, [navigation, isInteractive]);

  // Live-region announcement on entering (or updating) Results, so a screen
  // reader user gets the count without swiping through every row first.
  const lastAnnouncedCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== 'results') {
      lastAnnouncedCountRef.current = null;
      return;
    }
    if (lastAnnouncedCountRef.current === suggestions.length) return;
    lastAnnouncedCountRef.current = suggestions.length;
    AccessibilityInfo.announceForAccessibility(
      `${suggestions.length} address suggestion${suggestions.length === 1 ? '' : 's'} found`,
    );
  }, [phase, suggestions.length]);

  const handleSelect = useCallback(
    async (placeId: string) => {
      const resolved = await resolvePlace(placeId);
      if (!resolved) return;
      // `returnRouteName` is typed as `AddressPickerReturnRouteName` (today,
      // `'NewJob'` only) — every value it can hold declares
      // `pendingAddress?: ResolvedPlace`, so this type-checks without a cast.
      navigation.navigate({
        name: returnRouteName,
        params: { pendingAddress: resolved },
        merge: true,
      });
    },
    [navigation, resolvePlace, returnRouteName],
  );

  let body: ReactNode = null;
  switch (phase) {
    case 'idle':
      body = null;
      break;

    case 'below-threshold':
      body = <Text style={styles.hint}>Keep typing to search</Text>;
      break;

    case 'loading':
      body = (
        <>
          <ActivityIndicator style={styles.loadingIndicator} color={colors.primary} />
          {suggestions.length > 0 ? (
            <SuggestionList
              suggestions={suggestions}
              dimmed
              disabled
              resolvingPlaceId={null}
              onSelect={handleSelect}
            />
          ) : null}
        </>
      );
      break;

    case 'results':
      body = (
        <SuggestionList
          suggestions={suggestions}
          dimmed={false}
          disabled={false}
          resolvingPlaceId={null}
          onSelect={handleSelect}
        />
      );
      break;

    case 'no-results':
      body = (
        <EmptyState
          icon={<MapPin size={36} color={colors.primary} strokeWidth={1.5} />}
          title="No matching address"
          description={`We couldn't find a match for "${query.trim()}".`}
          ctaLabel="Enter manually"
          ctaVariant="secondary"
          onPressCta={() => navigation.goBack()}
        />
      );
      break;

    case 'error':
      body = (
        <EmptyState
          icon={<MapPin size={36} color={colors.primary} strokeWidth={1.5} />}
          title="Couldn't load suggestions"
          description={errorMessage ?? undefined}
          ctaLabel="Retry"
          onPressCta={retry}
        />
      );
      break;

    case 'resolving':
      body = (
        <SuggestionList
          suggestions={suggestions}
          dimmed={false}
          disabled
          resolvingPlaceId={resolvingPlaceId}
          onSelect={handleSelect}
        />
      );
      break;

    case 'resolve-failed':
      body = (
        <>
          <InlineError message={errorMessage ?? 'Something went wrong'} />
          <SuggestionList
            suggestions={suggestions}
            dimmed={false}
            disabled={false}
            resolvingPlaceId={null}
            onSelect={handleSelect}
          />
        </>
      );
      break;

    default:
      body = null;
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          disabled={!isInteractive}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}>
          <ArrowLeft
            size={24}
            color={isInteractive ? colors.textStrong : colors.textMuted}
            strokeWidth={2}
          />
        </Pressable>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search address..."
          autoFocus
          disabled={!isInteractive}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.body}>{body}</View>
    </SafeAreaView>
  );
}

function SuggestionList({
  suggestions,
  dimmed,
  disabled,
  resolvingPlaceId,
  onSelect,
}: {
  suggestions: PlaceSuggestion[];
  dimmed: boolean;
  disabled: boolean;
  resolvingPlaceId: string | null;
  onSelect: (placeId: string) => void;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.list, dimmed && styles.listDimmed]}>
      {suggestions.map(suggestion => {
        const isResolving = suggestion.placeId === resolvingPlaceId;
        return (
          <Pressable
            key={suggestion.placeId}
            testID={`address-suggestion-${suggestion.placeId}`}
            accessibilityRole="button"
            accessibilityLabel={suggestion.text}
            accessibilityState={{ disabled, busy: isResolving }}
            disabled={disabled}
            onPress={() => onSelect(suggestion.placeId)}
            style={[styles.row, disabled && !isResolving && styles.rowDisabled]}>
            <View style={styles.rowIcon}>
              <MapPin size={20} color={colors.primary} strokeWidth={2} />
            </View>
            <Text numberOfLines={2} style={styles.rowText}>
              {suggestion.text}
            </Text>
            {isResolving ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    marginLeft: -spacing.s1,
  },
  searchInput: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
  },
  hint: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  loadingIndicator: {
    marginBottom: spacing.s3,
  },
  list: {
    gap: spacing.s2,
    paddingBottom: spacing.s6,
  },
  listDimmed: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.min,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  rowText: {
    ...typography.body,
    color: colors.textBody,
    flex: 1,
  },
});
