/**
 * SignatureScreen — the customer-signature capture screen (Story 3.5,
 * ui-design-spec §11): instruction line, the pad card with a dashed "Sign
 * here" baseline until the first stroke, an inline error line, and the
 * Clear/Save footer.
 *
 * Save's sequence is capture → upload → advance → pop, and it is deliberately
 * resumable: `confirmedThisSession` latches after a successful upload so a
 * hard advance failure (offline) retries ONLY the advance on the next Save —
 * the bytes are already stored and re-uploading would fork the attachment.
 * Clear resets the latch: a cleared pad is a fresh drawing, so the next Save
 * must re-upload (the server's last-write-wins replaces the old signature).
 * A 422 on the advance (step already recorded — an offline race) reconciles
 * silently and still pops, mirroring 3.3 AC 5; a 422 whose server currentStep
 * is BEFORE signature_captured is a real rejection and surfaces as an error.
 *
 * A failed upload keeps the screen (and the drawing) up — the pad is never
 * cleared on failure. A network-class failure (status 0) gets the story's
 * offline copy instead of the raw transport message. // EPIC4: NetInfo gate
 * — Epic 4 swaps the post-failure copy for a pre-flight reachability check.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import SignatureView, {
  type SignatureViewRef,
} from 'react-native-signature-canvas';
import { Button, Card, IconButton } from '../../components/ui';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing, typography } from '../../theme';
import { jobService, type ApiError } from '../../services';
import { workflowCurrentStep } from '../../services/api/apiError';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { useAttachmentUpload } from './useAttachmentUpload';
import { errorMessage } from './attachmentUploadModel';
import { SIGNATURE_MIME_TYPE, signatureFilename } from '../../utils/signatureExport';
import { STEP_ORDER, type WorkflowStep } from './stepperModel';

type Navigation = NativeStackNavigationProp<TechnicianRootStackParamList, 'Signature'>;

/** The library ships its own footer buttons — ours replace them. */
const HIDE_PAD_FOOTER = '.m-signature-pad--footer { display: none; }';

/** AC 7's offline copy — shown for a network-class failure until Epic 4's
 * pre-flight reachability check lands (// EPIC4: NetInfo gate). */
const OFFLINE_COPY = 'Signature upload needs internet.';

export default function SignatureScreen() {
  const navigation = useNavigation<Navigation>();
  // Route-params guard: no jobId → nothing to sign; leave immediately.
  const jobId =
    useRoute<RouteProp<TechnicianRootStackParamList, 'Signature'>>().params
      ?.jobId;

  const padRef = useRef<SignatureViewRef | null>(null);
  const [hasStroke, setHasStroke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Latched once the upload confirms: a retry after that must only re-run the
  // advance, never re-upload (the bytes are already stored — see header).
  const confirmedThisSession = useRef(false);
  // Real busy guard: state alone can't close the window between the Save tap
  // and the native readSignature roundtrip that fires onOK.
  const busyRef = useRef(false);
  // The save chain outlives the screen (user can hit back mid-upload) — an
  // unmounted screen must not pop the route underneath or setState.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { uploadOne } = useAttachmentUpload({
    jobId,
    attachmentType: 'signature',
  });

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

  const onOK = useCallback(
    async (dataUri: string) => {
      if (!jobId || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (!confirmedThisSession.current) {
          await uploadOne({
            fileUri: dataUri,
            filename: signatureFilename(jobId),
            mimeType: SIGNATURE_MIME_TYPE,
          });
          confirmedThisSession.current = true;
        }
        try {
          await jobService.advanceWorkflow(
            jobId,
            'signature_captured',
            generateIdempotencyKey(),
          );
        } catch (caught) {
          // A 422 whose body names signature_captured (or a later step) means
          // the step is already recorded (an offline race) — that IS success.
          // An earlier currentStep is a real rejection — the step never
          // happened — and must surface as the inline error.
          const currentStep = workflowCurrentStep(caught as ApiError);
          // An unknown step string also reconciles to "not recorded" — the
          // server's vocabulary is the source of truth here.
          const recorded =
            currentStep != null &&
            STEP_ORDER.includes(currentStep as WorkflowStep) &&
            STEP_ORDER.indexOf(currentStep as WorkflowStep) >=
              STEP_ORDER.indexOf('signature_captured');
          if (!recorded) throw caught;
        }
        if (mountedRef.current) navigation.goBack();
      } catch (caught) {
        // A network-class failure (status 0) is not a server verdict — show
        // the story's offline copy instead of the raw transport message.
        setError(
          (caught as ApiError).status === 0
            ? OFFLINE_COPY
            : errorMessage(caught),
        );
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setBusy(false);
      }
    },
    [jobId, navigation, uploadOne],
  );

  const onSave = useCallback(() => {
    padRef.current?.readSignature(); // → onOK
  }, []);

  const onClear = useCallback(() => {
    // The real library routes clearSignature to its onClear prop — it does
    // NOT fire onEmpty (that only fires from readSignature on an empty pad),
    // so the stroke state is reset here, not via the pad.
    padRef.current?.clearSignature();
    setHasStroke(false);
    // A cleared pad is a fresh drawing: the latch no longer describes what's
    // on the pad, so the next Save re-uploads (server last-write-wins).
    confirmedThisSession.current = false;
    setError(null);
  }, []);

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
              backgroundColor="rgba(255,255,255,0)"
              webStyle={HIDE_PAD_FOOTER}
              onBegin={() => setHasStroke(true)}
              onEmpty={() => setHasStroke(false)}
              onOK={(dataUri: string) => void onOK(dataUri)}
              onError={() => {
                // A broken pad has no drawing to save — disable Save with it.
                setHasStroke(false);
                setError('Signature pad failed to load — go back and try again.');
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
        {/* EPIC4: NetInfo gate — a network-class failure shows OFFLINE_COPY
            above; Epic 4 replaces this post-failure copy with a pre-flight
            reachability check that disables Save up front. */}
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
    ...typography.title,
    fontSize: 20,
    lineHeight: 24,
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
