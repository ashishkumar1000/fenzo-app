/**
 * PunchButton — the Today-tab punch control (the approved mockup, drawn
 * verbatim): a circular gradient face inside a dashed ring, a status pill
 * overlapping the top edge, the fingerprint well, the big action label and
 * a dot + sub-label row. The gradient is SVG (RadialGradient) — the DS's
 * flat-color rule governs View backgrounds; the mockup's circle is drawn,
 * not filled, and colors.punch holds its inks.
 *
 * The lock postures render non-interactive (the prescreen says "outside
 * the fence"); the permission postures stay interactive and route to the
 * caller's remediation; everything else behaves exactly as the old flat
 * button did — same press contract, same a11y vocabulary, new skin.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Fingerprint, Lock } from 'lucide-react-native';
import { colors, fontSize, typography } from '../../../theme';
import type { TodayButtonState } from './attendanceTodayModel';
import {
  formatCountdown,
  formatCountdownWords,
} from './attendanceTodayModel';

/** Face and ring sizes — one deliberate step above every other control on
 *  the tab (the old 56 CTA's unmissability rule, scaled to the mockup). */
const RING_SIZE = 216;
const FACE_SIZE = 184;
const FP_WELL_SIZE = 60;

interface Scheme {
  face: { top: string; bottom: string };
  ring: string;
  pill: { bg: string; label: string; dot: string | null; lock: boolean } | null;
  dot: string | null;
  sub: string | null;
}

/** Pill + face + sub-label per posture — the mockup state table verbatim
 *  (row 5 postures share the dim skeleton; the pill drops rather than
 *  inventing copy for it). */
function schemeFor(state: TodayButtonState): Scheme {
  switch (state.kind) {
    case 'readyIn':
      // Without a fresh in-fence distance this is the row-5 fallback — the
      // dimmed skeleton, never the inviting ready face.
      if (state.distanceM == null) return dimAction('Tap to punch');
      return {
        face: colors.punch.in,
        ring: colors.punch.ringIn,
        pill: { bg: colors.punch.pillReady, label: 'READY', dot: null, lock: false },
        dot: colors.punch.dotIn,
        sub: 'Tap to punch',
      };
    case 'readyOut':
      if (state.distanceM == null) return dimAction('Tap to punch out');
      return {
        face: colors.punch.out,
        ring: colors.punch.ringOut,
        pill: {
          bg: colors.punch.pillShiftActive,
          label: 'SHIFT ACTIVE',
          dot: null,
          lock: false,
        },
        dot: colors.punch.dotOut,
        sub: 'Tap to punch out',
      };
    case 'locked':
      return {
        face: colors.punch.dim,
        ring: colors.punch.ringLockedIn,
        pill: { bg: colors.punch.pillLockedIn, label: 'LOCKED', dot: null, lock: true },
        dot: colors.punch.dotLockedIn,
        sub: 'Outside Geofence',
      };
    case 'lockedOut':
      return {
        face: colors.punch.dim,
        ring: colors.punch.ringLockedOut,
        pill: {
          bg: colors.punch.pillLockedOut,
          label: 'LOCKED OUT',
          dot: null,
          lock: true,
        },
        dot: colors.punch.dotLockedOut,
        sub: 'Outside Geofence',
      };
    case 'rateLimited':
      return {
        face: colors.punch.dim,
        ring: colors.borderSubtle,
        pill: null,
        dot: null,
        sub: `Try again in ${formatCountdown(state.remainingS)}`,
      };
    case 'permissionDenied':
      return dimAction('Turn on location to check in');
    case 'preciseOff':
      return dimAction('Turn on precise location to check in');
    case 'serviceOff':
      return dimAction('Turn on location to check in');
    case 'offline':
      return dimAction(null);
    case 'resolving':
    case 'dialogPending':
      return dimAction(null);
    case 'done':
    default:
      return dimAction(null);
  }
}

function dimAction(sub: string | null): Scheme {
  return {
    face: colors.punch.dim,
    ring: colors.borderSubtle,
    pill: null,
    dot: null,
    sub,
  };
}

/** The action this posture would fire — the label under the fingerprint
 *  and the a11y vocabulary. The rate-limited action reflects the PENDING
 *  action (the old button's rule). */
function actionFor(state: TodayButtonState): string {
  switch (state.kind) {
    case 'readyOut':
    case 'lockedOut':
      return 'Check out';
    case 'rateLimited':
      return state.action === 'out' ? 'Check out' : 'Check in';
    default:
      return 'Check in';
  }
}

/** A locked punch never fires; the blocked-location postures DO (they open
 *  remediation); offline/rate-limited/resolving/latched never do. */
function isInteractive(state: TodayButtonState): boolean {
  return (
    state.kind === 'readyIn' ||
    state.kind === 'readyOut' ||
    state.kind === 'permissionDenied' ||
    state.kind === 'preciseOff' ||
    state.kind === 'serviceOff'
  );
}

interface Props {
  state: TodayButtonState;
  /** Whether the primary action may fire at all (facts known). */
  enabled: boolean;
  onPress: () => void;
}

export function PunchButton({ state, enabled, onPress }: Props) {
  const scheme = schemeFor(state);
  const action = actionFor(state);
  const interactive = enabled && isInteractive(state);
  const blocked = !interactive;
  const spinning = state.kind === 'resolving' || state.kind === 'dialogPending';
  const a11yLabel =
    state.kind === 'rateLimited'
      ? `${action}, ${formatCountdownWords(state.remainingS)}`
      : [action, scheme.sub].filter(Boolean).join(' — ');

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled: blocked }}
        onPress={interactive ? onPress : undefined}
        disabled={blocked}
        style={({ pressed }) => [styles.hit, pressed && interactive && styles.pressed]}>
        <View style={styles.stage}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="punchFace" cx="50%" cy="30%" r="80%">
                <Stop offset="0" stopColor={scheme.face.top} />
                <Stop offset="1" stopColor={scheme.face.bottom} />
              </RadialGradient>
            </Defs>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_SIZE / 2 - 2}
              fill="none"
              stroke={scheme.ring}
              strokeWidth={2}
              strokeDasharray="4 7"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={FACE_SIZE / 2}
              fill="url(#punchFace)"
            />
          </Svg>

          {scheme.pill ? (
            <View style={[styles.pill, { backgroundColor: scheme.pill.bg }]}>
              {scheme.pill.lock ? (
                <Lock size={11} color={colors.surfaceCard} strokeWidth={2.6} />
              ) : (
                <View style={styles.pillDot} />
              )}
              <Text style={styles.pillLabel}>{scheme.pill.label}</Text>
            </View>
          ) : null}

          <View style={styles.faceContent}>
            <View style={styles.fpWell}>
              <Fingerprint size={30} color={colors.surfaceCard} strokeWidth={1.8} />
            </View>
            <Text style={styles.actionLabel}>{action}</Text>
            {spinning ? (
              <ActivityIndicator size="small" color={colors.surfaceCard} />
            ) : scheme.sub ? (
              <View style={styles.subRow}>
                {scheme.dot ? <View style={[styles.subDot, { backgroundColor: scheme.dot }]} /> : null}
                <Text style={styles.subLabel} maxFontSizeMultiplier={1.4}>
                  {scheme.sub}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  hit: {
    borderRadius: RING_SIZE / 2,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  stage: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 12,
    zIndex: 2,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceCard,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.surfaceCard,
  },
  faceContent: {
    width: FACE_SIZE,
    height: FACE_SIZE,
    borderRadius: FACE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  fpWell: {
    width: FP_WELL_SIZE,
    height: FP_WELL_SIZE,
    borderRadius: FP_WELL_SIZE / 2,
    backgroundColor: colors.punch.fingerWell,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  actionLabel: {
    ...typography.title,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.surfaceCard,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  subDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.surfaceCard,
  },
});
