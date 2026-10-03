import { Text, View, StyleSheet } from 'react-native';
import { getVersion } from 'react-native-device-info';
import { colors, spacing, typography } from '../../theme';

/**
 * Full-screen gate shown when the running app is older than the server's
 * `min_supported_version` (CAP-4). Deliberately bare — no navigation, no
 * data, no icons: it must render even when this app version is broken by
 * the very API changes that made an update mandatory. Copy comes from the
 * server (`force_update_message`), so ops can retune it per incident.
 */
export function ForcedUpdateScreen({ message }: { message: string }) {
  return (
    <View style={styles.container} testID="forced-update-screen">
      <Text style={[typography.heading, styles.title]}>Update required</Text>
      <Text style={[typography.body, styles.message]}>{message}</Text>
      <Text style={[typography.bodySm, styles.version]}>
        {`Installed version: v${getVersion()}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    padding: spacing.s8,
    backgroundColor: colors.surfacePage,
  },
  title: {
    color: colors.textStrong,
    textAlign: 'center',
  },
  message: {
    color: colors.textBody,
    textAlign: 'center',
  },
  version: {
    color: colors.textMuted,
  },
});
