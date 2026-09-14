/**
 * PersonRow — one person inside a detail card: avatar + name (+ optional
 * sub-line) and a trailing call affordance.
 *
 * ONLY the phone IconButton dials — the row itself is deliberately not
 * pressable, so brushing the row while scrolling can never start a call
 * (spec §4). Shared by the owner detail (1.2) and the technician detail
 * (3.2); dumb by design: props in, UI out.
 */
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, IconButton } from '../../../components/ui';
import { colors, spacing, touch, typography } from '../../../theme';

type Props = {
  name: string;
  countryCode: string;
  phoneNumber: string;
  /** Optional single line under the name (e.g. a role or note). */
  subLine?: string | null;
  /** Optional small control (e.g. a copy icon) shown right after the phone number. */
  action?: ReactNode;
};

export function PersonRow({
  name,
  countryCode,
  phoneNumber,
  subLine,
  action,
}: Props) {
  return (
    <View style={styles.row}>
      <Avatar name={name} size="md" />
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {subLine ? (
          <View style={styles.subLineRow}>
            <Text style={styles.subLine} numberOfLines={1}>
              {subLine}
            </Text>
            {action}
          </View>
        ) : null}
      </View>
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
  subLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
});
