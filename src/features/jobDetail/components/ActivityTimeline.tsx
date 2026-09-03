/**
 * ActivityTimeline — the job's activity log as a vertical rail: one dot per
 * event, a connector line between consecutive dots, the event label and its
 * timestamp to the right. Flat inside its SectionCard — no cards per row
 * (spec §4). Shared by the owner detail (1.2) and the technician detail's
 * history disclosure (3.2); dumb by design: props in, UI out.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../../theme';
import type { ActivityLogEntry } from '../../../services';
import { eventLabel } from '../eventLabels';

type Props = {
  /** Oldest-first, exactly as the API returns them. */
  entries: ActivityLogEntry[];
};

/**
 * Dot colour per event class (spec §4): the workflow's own steps are blue,
 * completion is green, cancellation is red, and everything else — created,
 * reassigned, conflict-resolved, or an event type this build has never seen —
 * is a neutral grey.
 */
function dotColor(eventType: string): string {
  if (eventType === 'step_completed') return colors.status.done.solid;
  if (eventType === 'job_cancelled') return colors.status.cancelled.solid;
  if (eventType.startsWith('step_')) return colors.status.progress.solid;
  return colors.textDisabled;
}

/** "12 Aug, 2:14 PM" — the timeline's timestamp format (AC 3). Unparseable input → raw. */
function timestampLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ActivityTimeline({ entries }: Props) {
  return (
    <View>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        return (
          <View style={styles.row} key={entry.id}>
            <View style={styles.rail}>
              <View
                style={[styles.dot, { backgroundColor: dotColor(entry.eventType) }]}
              />
              {isLast ? null : <View style={styles.connector} />}
            </View>
            <View style={styles.content}>
              {/* Unknown event types render their raw value (never crash). */}
              <Text style={styles.label}>{eventLabel(entry.eventType)}</Text>
              <Text style={styles.timestamp}>{timestampLabel(entry.createdAt)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingBottom: spacing.s3,
  },
  // Left rail: the dot, then the connector line stretching down to the next
  // row's dot (so the rail reads as one continuous line, not floating dots).
  rail: {
    width: 24,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: spacing.s1,
  },
  connector: {
    width: 1,
    flex: 1,
    backgroundColor: colors.borderSubtle,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  label: {
    ...typography.body,
    color: colors.textBody,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
});