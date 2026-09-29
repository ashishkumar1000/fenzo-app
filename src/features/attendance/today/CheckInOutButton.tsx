/**
 * CheckInOutButton.tsx — the one big action on the Today screen (Story
 * 16-4, DESIGN.md). Owns its own Pressable shell at `touch.large` (56) —
 * one deliberate size step above the design system's largest `Button`
 * (52), and `Button.style` cannot reach the inner pressable — because this
 * control is used one-handed, often walking, and must be unmissable.
 *
 * All state/label decisions come from the pure model; this component only
 * renders. The spinner spans GPS + submit (AD-21: no optimistic UI); the
 * rate-limited state is disabled with a live countdown label; the blocked
 * location states render their remediation labels and let the caller open
 * the right flow.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../../../theme';
import type { TodayButtonState } from './attendanceTodayModel';
import { formatCountdown, formatCountdownWords } from './attendanceTodayModel';

interface Props {
  state: TodayButtonState;
  /** Whether the primary action may fire at all (facts known, online…). */
  enabled: boolean;
  onPress: () => void;
}

/** Label per state — the UX copy table verbatim. The rate-limited action
 *  reflects the PENDING action (checked in → the blocked tap is a Check
 *  out), not a hardcoded "Check in". */
function labelFor(
  state: TodayButtonState,
  enabled: boolean,
): { text: string; countDown?: string } {
  switch (state.kind) {
    case 'offline':
      return { text: 'Check in' };
    case 'permissionDenied':
      return { text: 'Turn on location to check in' };
    case 'preciseOff':
      return { text: 'Turn on precise location to check in' };
    case 'serviceOff':
      return { text: 'Turn on location to check in' };
    case 'rateLimited':
      return {
        text: state.action === 'out' ? 'Check out' : 'Check in',
        countDown: `Try again in ${formatCountdown(state.remainingS)}`,
      };
    case 'dialogPending':
    case 'resolving':
      return { text: 'Check in' };
    case 'done':
      return { text: 'Check in' };
    case 'readyOut':
      return { text: 'Check out' };
    case 'readyIn':
    default:
      return { text: 'Check in' };
  }
}

/** A rate-limited, resolving or latched button never fires. */
function isInteractive(state: TodayButtonState, enabled: boolean): boolean {
  if (!enabled) return false;
  return (
    state.kind === 'readyIn' ||
    state.kind === 'readyOut' ||
    state.kind === 'permissionDenied' ||
    state.kind === 'preciseOff' ||
    state.kind === 'serviceOff'
  );
}

export function CheckInOutButton({ state, enabled, onPress }: Props) {
  const interactive = isInteractive(state, enabled);
  const disabled =
    state.kind === 'offline' ||
    state.kind === 'rateLimited' ||
    state.kind === 'dialogPending' ||
    state.kind === 'resolving' ||
    state.kind === 'done' ||
    !enabled;
  const { text, countDown } = labelFor(state, enabled);
  // The a11y label carries the ACTION and the countdown in words — a bare
  // "9:42" chip is unreadable through a screen reader (spec D11).
  const a11yLabel =
    state.kind === 'rateLimited'
      ? `${text}, ${formatCountdownWords(state.remainingS)}`
      : text;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled: disabled || !interactive }}
        onPress={interactive ? onPress : undefined}
        disabled={disabled || !interactive}
        style={({ pressed }) => [
          styles.cta,
          !interactive && styles.ctaDisabled,
          pressed && interactive && styles.ctaPressed,
        ]}>
        {state.kind === 'resolving' || state.kind === 'dialogPending' ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <Text style={[styles.ctaLabel, !interactive && styles.ctaLabelDisabled]}>
            {text}
          </Text>
        )}
      </Pressable>
      {countDown ? (
        <Text style={styles.countdown} maxFontSizeMultiplier={1.4}>
          {countDown}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cta: {
    height: 56, // touch.large — the one deliberately larger CTA (DESIGN.md)
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s4,
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaDisabled: {
    backgroundColor: colors.primarySoft,
  },
  ctaLabel: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  ctaLabelDisabled: {
    color: colors.textMuted,
  },
  countdown: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.status.scheduled.fg,
  },
});
