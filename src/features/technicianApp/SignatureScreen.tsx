/**
 * SignatureScreen — the customer-signature capture screen (Story 3.5,
 * ui-design-spec §11): instruction line, the pad card with a dashed "Sign
 * here" baseline until the first stroke, an inline error line, and the
 * Clear/Save footer.
 *
 * The Save orchestration (export → upload → advance → pop, its resumable
 * latch and 422 reconciliation) lives in `useSignatureSave`, extracted
 * verbatim (file split, behaviour unchanged) — see that file for the
 * failure-branch details.
 *
 * A failed upload keeps the screen (and the drawing) up — the pad is never
 * cleared on failure. // EPIC4: NetInfo gate — Epic 4 swaps the post-failure
 * copy for a pre-flight reachability check.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import SignatureView, {
  type SignatureViewRef,
} from 'react-native-signature-canvas';
import { Button, Card, IconButton } from '../../components/ui';
import { ChevronLeft } from 'lucide-react-native';
import { colors, fontSize, leading, spacing, typography } from '../../theme';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import { useSignatureSave } from './useSignatureSave';

/** The library ships its own footer buttons — ours replace them. */
const HIDE_PAD_FOOTER = '.m-signature-pad--footer { display: none; }';

type Navigation = NativeStackScreenProps<
  TechnicianRootStackParamList,
  'Signature'
>['navigation'];

export default function SignatureScreen() {
  const navigation = useNavigation<Navigation>();
  // Route-params guard: no jobId → nothing to sign; leave immediately.
  const jobId =
    useRoute<RouteProp<TechnicianRootStackParamList, 'Signature'>>().params
      ?.jobId;

  const padRef = useRef<SignatureViewRef | null>(null);
  const [hasStroke, setHasStroke] = useState(false);

  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('TechnicianTabs');
    }
  }, [navigation]);

  useEffect(() => {
    if (!jobId) goBackSafely();
  }, [jobId, goBackSafely]);

  const { busy, error, submitSignature, resetForNewDrawing, reportPadFailure } =
    useSignatureSave({ jobId, pop: () => navigation.goBack() });

  const onSave = useCallback(() => {
    padRef.current?.readSignature(); // → onOK
  }, []);

  const onClear = useCallback(() => {
    // The real library routes clearSignature to its onClear prop — it does
    // NOT fire onEmpty (that only fires from readSignature on an empty pad),
    // so the stroke state is reset here, not via the pad.
    padRef.current?.clearSignature();
    setHasStroke(false);
    resetForNewDrawing();
  }, [resetForNewDrawing]);

  if (!jobId) return null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <IconButton
          variant="ghost"
          size="md"
          label="Go back"
          onPress={goBackSafely}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
        <Text style={styles.title}>Customer signature</Text>
        {/* Trailing spacer keeps the title centred like the back-header pattern. */}
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.instruction}>
          Please ask the customer to sign below.
        </Text>

        <Card padding="none" style={styles.padCard}>
          <View style={styles.padContainer}>
            <SignatureView
              ref={padRef}
              style={styles.pad}
              penColor={colors.textStrong}
              // Transparent fill so the Card's white surface shows through
              // (the pad paints its own background otherwise).
              backgroundColor="transparent"
              webStyle={HIDE_PAD_FOOTER}
              onBegin={() => setHasStroke(true)}
              onEmpty={() => setHasStroke(false)}
              onOK={(dataUri: string) => void submitSignature(dataUri)}
              onError={() => {
                // A broken pad has no drawing to save — disable Save with it.
                setHasStroke(false);
                reportPadFailure();
              }}
            />
            {!hasStroke ? (
              <>
                <View pointerEvents="none" style={styles.baseline} />
                <Text pointerEvents="none" style={styles.baselineLabel}>
                  Sign here
                </Text>
              </>
            ) : null}
          </View>
        </Card>

        {error ? <Text style={styles.errorLine}>{error}</Text> : null}

        <View style={styles.footerRow}>
          <Button
            variant="secondary"
            size="md"
            onPress={onClear}
            style={styles.footerButton}>
            Clear
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!hasStroke}
            loading={busy}
            onPress={onSave}
            style={styles.footerButton}>
            Save signature
          </Button>
        </View>
        {/* EPIC4: NetInfo gate — a network-class failure shows the offline
            copy above; Epic 4 replaces this post-failure copy with a
            pre-flight reachability check that disables Save up front. */}
      </View>
    </SafeAreaView>
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
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    // One step smaller than `title` — this centered header is a screen-level
    // label, not a page title. Recompute the line height for the new size or
    // the spread's 2xl line height would leave a big gap under the text.
    ...typography.title,
    fontSize: fontSize.xl,
    lineHeight: Math.round(fontSize.xl * leading.tight),
    color: colors.textStrong,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: spacing.s4,
    gap: spacing.s4,
  },
  instruction: {
    ...typography.body,
    color: colors.textBody,
  },
  padCard: {
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
  },
  padContainer: {
    flex: 1,
  },
  pad: {
    flex: 1,
  },
  // The dashed sign-here baseline sits at 70% of the pad height.
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '70%',
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    borderStyle: 'dashed',
  },
  baselineLabel: {
    ...typography.caption,
    color: colors.textDisabled,
    position: 'absolute',
    left: 0,
    right: 0,
    top: '70%',
    marginTop: spacing.s1,
    textAlign: 'center',
  },
  errorLine: {
    ...typography.bodySm,
    color: colors.danger,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  footerButton: {
    flex: 1,
  },
});