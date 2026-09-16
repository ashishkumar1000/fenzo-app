/**
 * ApiSettingsScreen — the API server switch, reachable from the More tab's
 * Settings row. A single card: a "Use local API" switch, and — when local —
 * an editable URL field seeded with the config default
 * (`DEFAULT_LOCAL_API_URL`), so a changed LAN IP never needs a new build.
 *
 * The choice applies on the NEXT request (`apiClient`'s first interceptor
 * reads the effective URL per request) — no reload or restart. It persists
 * in MMKV, so it survives app restarts.
 *
 * This is a developer/tooling control, but it lives in the shipped app
 * (pre-launch) because physical-device testing needs it — a phone cannot
 * reach a laptop's localhost.
 */
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { Button, Card, IconButton, Input, Switch } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import {
  normalizeApiUrl,
  setApiEndpointMode,
  setLocalApiUrl,
} from '../../services';
import { useApiEndpoint } from './useApiEndpoint';

export default function ApiSettingsScreen() {
  const navigation = useNavigation();
  const { mode, localUrl } = useApiEndpoint();
  const isLocal = mode === 'local';

  // Local draft starts as the URL in force; reseeded if it changes elsewhere
  // (only this screen edits it, so this is just first-render correctness).
  const [draftUrl, setDraftUrl] = useState(localUrl);
  useEffect(() => setDraftUrl(localUrl), [localUrl]);

  const [urlError, setUrlError] = useState('');
  // The field is a draft: requests use the STORED url until "Save URL" —
  // the hint below makes that visible instead of leaving it silent.
  const normalizedDraft = draftUrl.trim().replace(/\/+$/, '');
  const draftDirty = normalizedDraft !== localUrl;
  const [justSaved, setJustSaved] = useState(false);

  const handleToggle = (next: boolean) => {
    setApiEndpointMode(next ? 'local' : 'prod');
  };

  const handleSaveUrl = () => {
    try {
      setLocalApiUrl(normalizeApiUrl(draftUrl));
      setUrlError('');
      setJustSaved(true);
    } catch (error) {
      setUrlError(error instanceof Error ? error.message : 'Enter a valid URL');
      setJustSaved(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <IconButton
          variant="ghost"
          size="md"
          label="Go back"
          onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
        <Text style={styles.title} numberOfLines={1}>
          Settings
        </Text>
        {/* Balances the back button so the title stays centered. */}
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card padding="none">
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.rowTitle}>Use local API</Text>
              <Text style={styles.rowSubtitle} numberOfLines={2}>
                {isLocal
                  ? `Requests go to ${localUrl}`
                  : 'Requests go to the production server'}
              </Text>
            </View>
            <Switch value={isLocal} onValueChange={handleToggle} />
          </View>
        </Card>

        {isLocal ? (
          <Card>
            <Input
              label="Local API URL"
              value={draftUrl}
              onChangeText={text => {
                setDraftUrl(text);
                setJustSaved(false);
              }}
              placeholder="http://192.168.x.x:3000/api/v1"
              error={urlError}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {urlError ? null : draftDirty ? (
              <Text style={styles.saveHint}>
                Not applied yet — tap Save URL to make this the active address.
              </Text>
            ) : justSaved ? (
              <Text style={[styles.saveHint, styles.saveHintDone]}>Saved</Text>
            ) : null}
            <Button
              variant="primary"
              size="md"
              onPress={handleSaveUrl}
              style={styles.saveButton}>
              Save URL
            </Button>
          </Card>
        ) : null}

        <Text style={styles.note}>
          The switch applies to your next action — no restart needed. The URL
          and the switch are remembered until you change them.
        </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  flex: {
    flex: 1,
  },
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
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  switchInfo: {
    flex: 1,
    gap: spacing.s1,
  },
  rowTitle: {
    ...typography.body,
    color: colors.textStrong,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  saveButton: {
    marginTop: spacing.s3,
  },
  saveHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.s2,
  },
  saveHintDone: {
    color: colors.status.done.fg,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.s2,
    paddingTop: spacing.s2,
  },
});