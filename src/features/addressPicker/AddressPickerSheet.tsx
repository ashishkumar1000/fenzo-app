/**
 * AddressPickerSheet — bottom-sheet modal (native TrueSheet, not a pushed
 * route) for searching and resolving a real address via
 * `useAddressAutosuggest`.
 *
 * Previously (Story 1.4) this was `AddressPickerScreen`, a pushed
 * native-stack route. On a physical device that turned out to conflict with
 * `AddCustomerSheet`'s own native modal: pushing a full-screen stack route
 * on top of an already-presented native sheet silently dismisses that sheet,
 * so returning from the address search left the "Add customer" sheet
 * closed even though its JS state still thought it was open. Rendering the
 * picker as its own nested sheet — opened and closed entirely within
 * `AddCustomerScreen`, no navigation involved — removes the conflict.
 *
 * Implements the epic's 8 states in strict precedence (see
 * `useAddressAutosuggest`'s `phase`): Idle → Below-threshold → Loading →
 * Results → No-results → Error → Resolving → Resolve-failed.
 *
 * Sheet content stays mounted while hidden (see `Sheet`'s own doc), so this
 * calls `reset()` every time `visible` turns true — otherwise a second
 * search within the same "Add customer" visit would reuse the first
 * search's session token and stale results.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MapPin, Search } from 'lucide-react-native';
import { EmptyState, InlineError, Input, Sheet } from '../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../theme';
import type { PlaceSuggestion, ResolvedPlace } from '../../services';
import { useAddressAutosuggest } from './useAddressAutosuggest';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Fires once a suggestion resolves. The caller (`AddCustomerScreen`)
   *  populates its own fields and is responsible for closing the sheet —
   *  this component never closes itself. */
  onResolved: (place: ResolvedPlace) => void;
};

export default function AddressPickerSheet({ visible, onClose, onResolved }: Props) {
  const {
    query,
    setQuery,
    phase,
    suggestions,
    errorMessage,
    resolvingPlaceId,
    retry,
    resolvePlace,
    reset,
  } = useAddressAutosuggest();

  // Fresh search session every time the sheet opens — see file doc.
  useEffect(() => {
    if (visible) reset();
    // `reset` is stable (empty dep `useCallback`); only `visible` should
    // retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Sheet content stays mounted across opens/closes, so the `Input` only
  // ever mounts once — a plain `autoFocus` prop would only fire the very
  // first time the sheet ever presents. Focusing from `onDidPresent`
  // instead re-fires on every open.
  const inputRef = useRef<TextInput>(null);

  const isInteractive = phase !== 'resolving';

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
      onResolved(resolved);
    },
    [resolvePlace, onResolved],
  );

  // No ScrollView/FlatList here at all — `Sheet`'s `scrollable` prop (a
  // TrueSheet binding onto a specific scroll-view instance) turned out to
  // leave real, successfully-fetched results invisible on-device, and
  // survived several reworks meant to keep that scroll-view instance stable
  // (see git history on this file). Suggestions are just mapped into plain
  // `View`s below — no in-sheet scrolling for a long result list, but a
  // real fix pending an upstream resolution beats a fancier list that
  // silently renders nothing.
  let body: ReactNode = null;

  switch (phase) {
    // Idle/below-threshold show right as the keyboard opens (search
    // `autoFocus`s), which eats a large share of the sheet's visible height
    // — a top-aligned, compact prompt (not `EmptyState`'s flex-centered
    // layout, built for a full-height empty screen) avoids colliding with
    // the search box above it.
    case 'idle':
      body = (
        <Prompt
          title="Find a verified address"
          description="Start typing a building, street, or landmark to search."
        />
      );
      break;

    case 'below-threshold':
      body = (
        <Prompt title="Keep typing" description="A couple more characters to search." />
      );
      break;

    case 'loading':
      body = (
        <>
          <ActivityIndicator style={styles.loadingIndicator} color={colors.primary} />
          <SuggestionRows
            suggestions={suggestions}
            disabled
            resolvingPlaceId={null}
            onSelect={handleSelect}
          />
        </>
      );
      break;

    case 'results':
      body = (
        <SuggestionRows
          suggestions={suggestions}
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
          onPressCta={onClose}
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
        <SuggestionRows
          suggestions={suggestions}
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
          <SuggestionRows
            suggestions={suggestions}
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
    <Sheet
      visible={visible}
      onClose={isInteractive ? onClose : () => {}}
      title="Search address"
      subtitle="Powered by Google Places"
      detents={[0.9]}
      dismissible={isInteractive}
      onDidPresent={() => inputRef.current?.focus()}>
      <Input
        ref={inputRef}
        value={query}
        onChangeText={setQuery}
        placeholder="Search address..."
        disabled={!isInteractive}
        autoCapitalize="none"
        autoCorrect={false}
        leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
        style={styles.searchInput}
      />
      <View style={styles.body}>{body}</View>
    </Sheet>
  );
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

/** Compact, top-aligned prompt for idle/below-threshold — see the phase
 *  switch's comment on why this isn't `EmptyState`. */
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
  searchInput: {
    marginTop: spacing.s2,
  },
  body: {
    flex: 1,
    marginTop: spacing.s2,
    gap: spacing.s2,
    paddingBottom: spacing.s6,
  },
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
  // No margin needed — `body`'s `gap` already spaces every direct child
  // (this indicator, an `InlineError`, each row) evenly.
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
