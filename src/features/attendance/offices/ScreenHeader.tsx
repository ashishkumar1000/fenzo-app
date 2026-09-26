/**
 * ScreenHeader — the back-button + title header shared by the Story 15-4
 * office screens (same pattern as ReportsScreen's header). `right` renders
 * an optional trailing element (e.g. a status pill) aligned to the edge.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { IconButton } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  title: string;
  onBack: () => void;
  right?: ReactNode;
};

export default function ScreenHeader({ title, onBack, right }: Props) {
  return (
    <View style={styles.header}>
      <IconButton variant="ghost" size="md" label="Go back" onPress={onBack}>
        <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
      </IconButton>
      <Text style={styles.title}>{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
    flex: 1,
  },
});
