import { StyleSheet, View } from 'react-native';
import { Button } from '../../../components/ui';
import { colors, spacing } from '../../../theme';

type Props = {
  jobStatus: string;
  onEdit: () => void;
  onCancel: () => void;
};

export function JobActionsSection({ jobStatus, onEdit, onCancel }: Props) {
  if (jobStatus !== 'scheduled') {
    return null;
  }

  return (
    <View testID="job-detail-actions" style={styles.actionsRow}>
      <Button
        variant="secondary"
        size="md"
        style={styles.editButton}
        onPress={onEdit}>
        Edit job
      </Button>
      <Button
        variant="ghost"
        size="md"
        labelColor={colors.danger}
        onPress={onCancel}>
        Cancel job
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  editButton: {
    flex: 1,
  },
});
