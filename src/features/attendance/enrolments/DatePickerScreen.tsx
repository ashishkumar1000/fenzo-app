/**
 * DatePickerScreen — full-screen date selection (Story 15-9,
 * user-directed design): a dedicated calendar PAGE built on the
 * `react-native-ui-datepicker` library (reuse over custom implementations),
 * with a pinned confirm button that enables once a date is selected —
 * tapping it returns to the previous page with the new date.
 *
 * Why a page and not an inline calendar: compact fields inside constrained
 * containers (bottom sheets, cards) are the mobile standard, and inline
 * calendars there collide with pinned footers and nested scrolling
 * (Material: avoid scrolling inside pickers; full-screen is the
 * narrow-viewport pattern).
 *
 * Generic navigate-back-with-params (the SelectTechniciansScreen idiom):
 * the opener passes { title, value, today, minDate, maxDate, returnTo,
 * context }; the confirm pops back to `returnTo` merging
 * { pickedDate, context }. The opener owns what the date means — the
 * picker never writes anything.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import DatePicker from 'react-native-ui-datepicker';
import type { DateType } from 'react-native-ui-datepicker';
import { Button } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import ScreenHeader from '../offices/ScreenHeader';
import type {
  LeaveApplyParams,
  RootStackParamList,
  TechnicianRootStackParamList,
} from '../../../navigation/types';

/**
 * Dual-stack registration (17-5): the picker is registered on BOTH the
 * owner root stack (since 15-9) and the technician root stack (the leave
 * form's From/To rows). Props type against the two param lists'
 * INTERSECTION — the NotificationsScreen (14-3) house pattern — so one
 * component typechecks on either navigator with zero behaviour change;
 * `DatePicker` is deliberately declared in both stacks with the one shared
 * `DatePickerParams` shape. `today` is optional (17-5: the upcoming leave
 * flow has no server today) — destructured below, never used.
 */
type Props = NativeStackScreenProps<
  RootStackParamList & TechnicianRootStackParamList,
  'DatePicker'
>;

/** The library's onChange hands a DateType (string | Dayjs | Date) —
 *  normalise to the app's YYYY-MM-DD without importing its dayjs. */
function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const withFormat = value as { format?: (f: string) => string };
  if (typeof withFormat.format === 'function') {
    return withFormat.format('YYYY-MM-DD');
  }
  if (value instanceof Date) {
    // The library emits a JS Date at LOCAL midnight of the tapped calendar
    // day — UTC-formatting it (toISOString) shifted the day back for any
    // timezone behind UTC (device-found: tap 16 → 15 selected). Read the
    // local components.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

export default function DatePickerScreen({ navigation, route }: Props) {
  const { title, value, today, minDate, maxDate, returnTo, context } =
    route.params;
  const [selected, setSelected] = useState<string | null>(value ?? null);

  const confirm = () => {
    if (!selected) return;
    // popTo pops us off the stack and merges the param onto the caller
    // (the SelectTechniciansScreen pattern — React Navigation 7's plain
    // navigate would push a new screen instead of returning). The picker
    // never interprets the context — the opener owns what the date means.
    if (returnTo === 'LeaveApply') {
      // merge:true shallow-spreads these onto the route's existing params,
      // so `today` survives by being OMITTED (passing undefined would wipe
      // it) — React Navigation's types can't express that merge-partial,
      // hence the scoped assertion. `context` narrows back to the leave
      // channel purely at the type level (the LeaveApply opener minted it
      // as 'from' | 'to'; it travels as a plain string through params).
      navigation.popTo(
        'LeaveApply',
        {
          pickedDate: selected,
          context: context as LeaveApplyParams['context'],
        } as LeaveApplyParams,
        { merge: true },
      );
    } else {
      navigation.popTo(
        'AttendanceEnrolments',
        { pickedDate: selected, context },
        { merge: true },
      );
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <DatePicker
          mode="single"
          date={selected ? dayjs(selected) : undefined}
          onChange={({ date }: { date: DateType }) => setSelected(toIso(date))}
          minDate={minDate ? dayjs(minDate) : undefined}
          maxDate={maxDate ? dayjs(maxDate) : undefined}
          locale="en"
          components={{
            // The library's default arrows are invisible on the page
            // surface — themed lucide chevrons (found on device).
            IconPrev: <ChevronLeft size={22} color={colors.textStrong} />,
            IconNext: <ChevronRight size={22} color={colors.textStrong} />,
          }}
          styles={{
            button_prev: { padding: spacing.s2 },
            button_next: { padding: spacing.s2 },
            button_prev_image: { tintColor: colors.textStrong },
            button_next_image: { tintColor: colors.textStrong },
            month_selector_label: {
              ...typography.heading,
              color: colors.textStrong,
            },
            weekdays: { marginBottom: spacing.s2 },
            day_cell: { paddingVertical: 2 },
            day: { borderRadius: radius.sm },
            day_label: { color: colors.textStrong },
            today_label: { color: colors.primary, fontWeight: '700' },
            selected: {
              backgroundColor: colors.primary,
              borderRadius: radius.sm,
            },
            selected_label: { color: colors.onPrimary, fontWeight: '700' },
            disabled_label: { color: colors.textMuted, opacity: 0.5 },
          }}
        />
      </ScrollView>

      {/* Pinned confirm — enabled once a date is selected. */}
      <View style={styles.footer}>
        <Button onPress={confirm} disabled={!selected} fullWidth>
          {selected ? `Set ${formatShort(selected)}` : 'Pick a date'}
        </Button>
      </View>
    </SafeAreaView>
  );
}

/** Compact button label — "Set 3 Oct" reads faster than the long form. */
function formatShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleString('en-US', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.s4,
  },
  footer: {
    padding: spacing.s4,
    backgroundColor: colors.surfaceCard,
  },
});
