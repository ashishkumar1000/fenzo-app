/**
 * TimingsStep — wizard step 2 (Story 15-8). A REVIEW step: an office is
 * created WITH its rules (15-3 shape — OfficeForm collects them inline
 * with the default radius/cut-off/hours), so by step 2 every live office
 * already carries a `rule`. The step lists each live office's current rule
 * (start–end, cut-off, hours); a row tap pushes `OfficeForm` in edit mode.
 * Continue's gate (≥1 live office, none missing a rule) lives in the
 * wizard model — the screen's footer renders its caption.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import { Button, InlineError, Skeleton } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
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
  onEditOffice: (officeId: string) => void;
  onAddOffice: () => void;
};

export function TimingsStep({
  offices,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  onEditOffice,
  onAddOffice,
}: Props) {
  if (isLoading && !hasLoaded) {
    // First load: a row-shaped shimmer, labelled (the 19-5 idiom).
    return (
      <View style={styles.skeleton} accessibilityLabel="Loading attendance">
        <Skeleton rows={3} height={64} />
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
        <Text style={styles.emptyText}>
          No offices yet. Add one and its working hours come with it.
        </Text>
        <Button
          variant="secondary"
          leadingIcon={<Plus size={16} color={colors.primary} strokeWidth={2} />}
          onPress={onAddOffice}>
          Add office
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {offices.map((office) => (
        <Pressable
          key={office.id}
          accessibilityRole="button"
          accessibilityLabel={`Edit timings for ${office.name}`}
          onPress={() => onEditOffice(office.id)}
          style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {office.name}
            </Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {office.rule ? describeOfficeRule(office.rule) : 'Timings not set'}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      ))}
      <Button
        variant="secondary"
        leadingIcon={<Plus size={16} color={colors.primary} strokeWidth={2} />}
        onPress={onAddOffice}>
        Add office
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  skeleton: {
    paddingVertical: spacing.s8,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
  },
  rowText: {
    flex: 1,
    gap: spacing.s1,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  rowSubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
