/**
 * OfficesStep — wizard step 1 (Story 15-8). A server-truth SUMMARY of the
 * tenant's live offices; all editing is delegated to the shipped routes
 * ("Manage offices" pushes `AttendanceOffices`, which owns create/edit/
 * archive + their loading/error/save handling — the wizard owns progress
 * only). The tri-state follows the `useOffices` contract: first-load
 * spinner, first-load InlineError + Retry, stale banner over live rows.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MapPin, Plus } from 'lucide-react-native';
import {
  Button,
  Card,
  EmptyState,
  InlineError,
} from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { ApiError } from '../../../services';
import type { Office } from '../../../types/office';
import { describeOfficeRule } from './wizardModel';

type Props = {
  /** Live offices only (the model's `liveOffices` filter). */
  offices: Office[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onManageOffices: () => void;
};

export function OfficesStep({
  offices,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  onManageOffices,
}: Props) {
  if (isLoading && !hasLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && !hasLoaded) {
    return (
      <View style={styles.stack}>
        <InlineError message="Couldn't load offices. Check your connection and try again." />
        <Button variant="secondary" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }

  if (offices.length === 0) {
    return (
      <View style={styles.stack}>
        <EmptyState
          icon={<MapPin size={24} color={colors.primary} strokeWidth={1.5} />}
          title="No offices yet"
          description="Add your first office — its pin on the map and its working hours are what attendance is checked against."
          ctaLabel="Add office"
          ctaIcon={<Plus size={16} color={colors.onPrimary} strokeWidth={2} />}
          onPressCta={onManageOffices}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {offices.map((office) => (
        <Card key={office.id} padding="md">
          <Text style={styles.officeName} numberOfLines={1}>
            {office.name}
          </Text>
          <Text style={styles.officeRule} numberOfLines={1}>
            {office.rule ? describeOfficeRule(office.rule) : 'Timings not set'}
          </Text>
        </Card>
      ))}
      <Button
        variant="secondary"
        leadingIcon={<Plus size={16} color={colors.primary} strokeWidth={2} />}
        onPress={onManageOffices}>
        Manage offices
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  officeName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  officeRule: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
});
