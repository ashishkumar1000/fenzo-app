/**
 * AddTechnicianSheet — bottom-sheet form to invite a technician (name + phone).
 * Matches the Fenzit sheet pattern (rounded top, upward shadow, grabber).
 *
 * Presentational + local form state only. The parent owns persistence: on
 * submit it receives the captured input via `onSubmit` and decides what to do.
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Phone, User } from 'lucide-react-native';
import { Button, Input } from '../../../components/ui';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import type { NewTechnicianInput } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: NewTechnicianInput) => void;
};

export function AddTechnicianSheet({ visible, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const canSubmit = name.trim().length > 0 && phone.trim().length >= 7;

  const reset = () => {
    setName('');
    setPhone('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ name, phone });
    reset();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.grabber} />

            <Text style={styles.title}>Add technician</Text>
            <Text style={styles.subtitle}>
              They'll get an SMS invite to download the Fenzit app and come online.
            </Text>

            <View style={styles.form}>
              <Input
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Suresh Kumar"
                autoCapitalize="words"
                leadingIcon={<User size={18} color={colors.textMuted} strokeWidth={2} />}
              />
              <Input
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. +91 98765 43210"
                keyboardType="phone-pad"
                leadingIcon={<Phone size={18} color={colors.textMuted} strokeWidth={2} />}
              />
            </View>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canSubmit}
              onPress={handleSubmit}>
              Send invite
            </Button>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s4,
    gap: spacing.s4,
    ...shadow.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderDefault,
    marginBottom: spacing.s2,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: -spacing.s2,
  },
  form: {
    gap: spacing.s4,
  },
});
