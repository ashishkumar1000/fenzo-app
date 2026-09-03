/**
 * PersonRow — one person inside a detail card: avatar + name (+ optional
 * sub-line) and a trailing call affordance.
 *
 * ONLY the phone IconButton dials — the row itself is deliberately not
 * pressable, so brushing the row while scrolling can never start a call
 * (spec §4). Shared by the owner detail (1.2) and the technician detail
 * (3.2); dumb by design: props in, UI out.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Phone } from 'lucide-react-native';
import { Avatar, IconButton } from '../../../components/ui';
import { colors, spacing, touch, typography } from '../../../theme';
import { openTel } from '../../../utils/linking';

type Props = {
  name: string;
  countryCode: string;
  phoneNumber: string;
  /** Optional single line under the name (e.g. a role or note). */
  subLine?: string | null;
};

export function PersonRow({ name, countryCode, phoneNumber, subLine }: Props) {
  return (
    <View style={styles.row}>
      <Avatar name={name} size="md" />
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {subLine ? (
          <Text style={styles.subLine} numberOfLines={1}>
            {subLine}
          </Text>
        ) : null}
      </View>
      <IconButton
        variant="ghost"
        size="md"
        label={`Call ${name}`}
        onPress={() => void openTel(countryCode, phoneNumber)}>
        <Phone size={18} color={colors.primary} strokeWidth={2} />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.min,
  },
  identity: {
    flex: 1,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  subLine: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});