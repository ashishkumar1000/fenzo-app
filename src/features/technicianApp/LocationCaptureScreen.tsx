import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { colors, spacing, touch, typography } from '../../theme';
import { jobService, type ApiError } from '../../services';
import { getCurrentPosition, requestLocationPermission, type GeolocationCoordinates } from './geolocation';
import { generateIdempotencyKey } from '../../utils/idempotency';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationCapture'>;

export function LocationCaptureScreen({ navigation, route }: Props) {
  const { jobId, stepKey } = route.params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const keyRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    void captureLocation();
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function captureLocation() {
    setLoading(true);
    setError(null);

    try {
      const permOutcome = await requestLocationPermission();
      let position: typeof undefined | GeolocationCoordinates = undefined;

      if (permOutcome.status === 'granted') {
        position = await getCurrentPosition(15000);
      }

      const key = (keyRef.current ??= generateIdempotencyKey());
      await jobService.advanceWorkflow(jobId, stepKey, key, {
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        accuracy: position?.accuracy ?? null,
      });

      keyRef.current = null;
      navigation.goBack();
    } catch (caught) {
      const err = caught as Error | ApiError;
      const msg = 'message' in err ? err.message : String(caught);

      try {
        const key = (keyRef.current ??= generateIdempotencyKey());
        await jobService.advanceWorkflow(jobId, stepKey, key, {
          latitude: null,
          longitude: null,
          accuracy: null,
        });
        keyRef.current = null;
        navigation.goBack();
      } catch (advanceErr) {
        const advanceMsg = 'message' in (advanceErr as any)
          ? (advanceErr as Error).message
          : String(advanceErr);
        setError(advanceMsg);
        setLoading(false);
      }
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>Verify location</Text>
      </View>

      <View style={styles.content}>
        {loading && !error ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.message}>
              Getting your location...
            </Text>
          </>
        ) : error ? (
          <>
            <Text style={styles.errorMessage}>{error}</Text>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={retrying}
              onPress={() => {
                setRetrying(true);
                void captureLocation().finally(() => {
                  if (isMountedRef.current) setRetrying(false);
                });
              }}>
              {retrying ? 'Retrying…' : 'Try again'}
            </Button>
            <Button variant="secondary" size="lg" fullWidth onPress={() => navigation.goBack()}>
              Cancel
            </Button>
          </>
        ) : null}
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
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    minWidth: touch.min,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.s1,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s4,
    gap: spacing.s4,
  },
  message: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  errorMessage: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
