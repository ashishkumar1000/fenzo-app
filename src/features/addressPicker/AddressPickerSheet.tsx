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
 * The sheet owns the hook wiring (query input, mode, reset-on-open, the
 * live-region count announcement); the 8 search states themselves render in
 * `SearchPhaseBody`, extracted verbatim (file split, behaviour unchanged).
 *
 * Sheet content stays mounted while hidden (see `Sheet`'s own doc), so this
 * calls `reset()` every time `visible` turns true — otherwise a second
 * search within the same "Add customer" visit would reuse the first
 * search's session token and stale results. The same effect also returns the
 * sheet to search mode: a manual-entry session must never carry over into
 * the next open.
 *
 * Besides searching, this hosts the no-results fallback: "Enter manually"
 * swaps the search UI for `ManualAddressForm` (mode: 'manual'), which emits
 * a `ManualAddressEntry` through `onManualAddress` — no `placeId` or
 * coordinates, since a hand-typed address has none.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { Input, Sheet } from '../../components/ui';
import { colors, spacing } from '../../theme';
import type { ResolvedPlace } from '../../services';
import { useAddressAutosuggest } from './useAddressAutosuggest';
import { ManualAddressForm, type ManualAddressEntry } from './ManualAddressForm';
import { SearchPhaseBody } from './SearchPhaseBody';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Fires once a suggestion resolves. The caller (`AddCustomerScreen`)
   *  populates its own fields and is responsible for closing the sheet —
   *  this component never closes itself. */
  onResolved: (place: ResolvedPlace) => void;
  /** Fires on "Use this address" from the manual-entry form (no-results
   *  fallback). Same close-the-sheet-yourself contract as `onResolved`. */
  onManualAddress: (entry: ManualAddressEntry) => void;
};

export default function AddressPickerSheet({
  visible,
  onClose,
  onResolved,
  onManualAddress,
}: Props) {
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

  // 'manual' swaps the search UI for the manual-entry form (see file doc).
  const [mode, setMode] = useState<'search' | 'manual'>('search');

  // Fresh search session (and search mode) every time the sheet opens — see
  // file doc.
  useEffect(() => {
    if (visible) {
      setMode('search');
      reset();
    }
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

  // Manual mode replaces the whole search UI — the hook's phase/query are
  // untouched underneath, so "Back to search" restores the no-results view
  // the user came from.
  if (mode === 'manual') {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Enter address"
        subtitle="Saved as text — no map pin"
        detents={[0.9]}>
        <ManualAddressForm onBack={() => setMode('search')} onUse={onManualAddress} />
      </Sheet>
    );
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
      <View style={styles.body}>
        <SearchPhaseBody
          phase={phase}
          query={query}
          suggestions={suggestions}
          errorMessage={errorMessage}
          resolvingPlaceId={resolvingPlaceId}
          retry={retry}
          onSelect={handleSelect}
          onEnterManual={() => setMode('manual')}
        />
      </View>
    </Sheet>
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
});