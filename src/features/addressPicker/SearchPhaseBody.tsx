/**
 * SearchPhaseBody — the 8-phase search-state rendering for
 * `AddressPickerSheet`, extracted verbatim (file split, behaviour unchanged):
 * the phase → JSX switch, the `SuggestionRows` list and the compact `Prompt`,
 * plus their styles. The sheet keeps the hook wiring (query input, mode,
 * reset-on-open); this file is only the body that reacts to `phase`.
 *
 * Idle/below-threshold show right as the keyboard opens (search `autoFocus`s),
 * which eats a large share of the sheet's visible height — a top-aligned,
 * compact prompt (not `EmptyState`'s flex-centered layout, built for a
 * full-height empty screen) avoids colliding with the search box above it.
 *
 * No ScrollView/FlatList here either — `Sheet`'s `scrollable` prop (a
 * TrueSheet binding onto a specific scroll-view instance) turned out to
 * leave real, successfully-fetched results invisible on-device, and
 * survived several reworks meant to keep that scroll-view instance stable
 * (see git history on `AddressPickerSheet.tsx`). Suggestions are just mapped
 * into plain `View`s — no in-sheet scrolling for a long result list, but a
 * real fix pending an upstream resolution beats a fancier list that
 * silently renders nothing.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { EmptyState, InlineError } from '../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../theme';
import type { AddressPickerPhase } from './useAddressAutosuggest';
import type { PlaceSuggestion } from '../../services';

type Props = {
  phase: AddressPickerPhase;
  /** The raw query — used verbatim in the no-results copy. */
  query: string;
  suggestions: PlaceSuggestion[];
  /** Autosuggest error copy (error / resolve-failed phases). */
  errorMessage: string | null;
  /** The row currently resolving — spins that row and disables the list. */
  resolvingPlaceId: string | null;
  /** Re-fires the last query (error phase's Retry CTA). */
  retry: () => void;
  /** A resolved suggestion tap — the sheet owns the resolve call. */
  onSelect: (placeId: string) => void;
  /** The no-results fallback's CTA — swaps the sheet into manual-entry mode. */
  onEnterManual: () => void;
};

export function SearchPhaseBody({
  phase,
  query,
  suggestions,
  errorMessage,
  resolvingPlaceId,
  retry,
  onSelect,
  onEnterManual,
}: Props) {
  switch (phase) {
    case 'idle':
      return (
        <Prompt
          title="Find a verified address"
          description="Start typing a building, street, or landmark to search."
        />
      );

    case 'below-threshold':
      return (
        <Prompt title="Keep typing" description="A couple more characters to search." />
      );

    case 'loading':
      return (
        <>
          <ActivityIndicator style={styles.loadingIndicator} color={colors.primary} />
          <SuggestionRows
            suggestions={suggestions}
            disabled
            resolvingPlaceId={null}
            onSelect={onSelect}
          />
        </>
      );

    case 'results':
      return (
        <SuggestionRows
          suggestions={suggestions}
          disabled={false}
          resolvingPlaceId={null}
          onSelect={onSelect}
        />
      );

    case 'no-results':
      return (
        <EmptyState
          icon={<MapPin size={36} color={colors.primary} strokeWidth={1.5} />}
          title="No matching address"
          description={`We couldn't find a match for "${query.trim()}".`}
          ctaLabel="Enter manually"
          ctaVariant="secondary"
          onPressCta={onEnterManual}
        />
      );

    case 'error':
      return (
        <EmptyState
          icon={<MapPin size={36} color={colors.primary} strokeWidth={1.5} />}
          title="Couldn't load suggestions"
          description={errorMessage ?? undefined}
          ctaLabel="Retry"
          onPressCta={retry}
        />
      );

    case 'resolving':
      return (
        <SuggestionRows
          suggestions={suggestions}
          disabled
          resolvingPlaceId={resolvingPlaceId}
          onSelect={onSelect}
        />
      );

    case 'resolve-failed':
      return (
        <>
          <InlineError message={errorMessage ?? 'Something went wrong'} />
          <SuggestionRows
            suggestions={suggestions}
            disabled={false}
            resolvingPlaceId={null}
            onSelect={onSelect}
          />
        </>
      );

    default:
      return null;
  }
}

function SuggestionRows({
  suggestions,
  disabled,
  resolvingPlaceId,
  onSelect,
}: {
  suggestions: PlaceSuggestion[];
  disabled: boolean;
  resolvingPlaceId: string | null;
  onSelect: (placeId: string) => void;
}) {
  return (
    <>
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
    </>
  );
}

/** Compact, top-aligned prompt for idle/below-threshold — see the file doc
 *  on why this isn't `EmptyState`. */
function Prompt({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.prompt}>
      <View style={styles.promptIcon}>
        <MapPin size={22} color={colors.primary} strokeWidth={1.5} />
      </View>
      <View style={styles.promptText}>
        <Text style={styles.promptTitle}>{title}</Text>
        <Text style={styles.promptDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
    paddingVertical: spacing.s2,
  },
  promptIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptText: {
    flex: 1,
    gap: spacing.s1,
    paddingTop: spacing.s1,
  },
  promptTitle: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  promptDescription: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  // No margin needed — the sheet body's `gap` already spaces every direct
  // child (this indicator, an `InlineError`, each row) evenly.
  loadingIndicator: {
    alignSelf: 'center',
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