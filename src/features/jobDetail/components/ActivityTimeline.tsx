/**
 * ActivityTimeline — the job's activity log as a vertical rail: one dot per
 * event, a connector line between consecutive dots, the event label and its
 * timestamp to the right. Flat inside its SectionCard — no cards per row
 * (spec §4). Shared by the owner detail (1.2) and the technician detail's
 * history disclosure (3.2); dumb by design: props in, UI out.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Check, MapPin, Plus, EqualApproximately } from 'lucide-react-native';
import { colors, spacing, typography } from '../../../theme';
import { Badge } from '../../../components/ui';
import type { ActivityLogEntry, WorkflowTemplate } from '../../../services';
import { formatDistance, haversineMetres } from '../../../utils';
import { eventStatusKey, resolveEventLabel } from '../eventLabels';
import { parseStepLocation } from '../locationMetadata';

type Props = {
  /** Oldest-first, exactly as the API returns them. */
  entries: ActivityLogEntry[];
  /** Job's workflow template to resolve step labels from; may be null. */
  workflowTemplate?: WorkflowTemplate | null;
  /**
   * The job site's saved coordinates (the job's customer, story 2.1) — the
   * other end of the distance caption. Null/absent when the customer has no
   * saved coordinates: the caption then says location was captured without
   * a distance, never a fabricated one.
   */
  jobSite?: { latitude: number; longitude: number } | null;
};

/**
 * Dot colour per event class (spec §4), via the shared `eventStatusKey`
 * mapping: the workflow's own steps are blue, completion is green,
 * cancellation is red, and everything else — created, reassigned,
 * conflict-resolved, or an event type this build has never seen — is a
 * neutral grey.
 */
function dotColor(eventType: string): string {
  const key = eventStatusKey(eventType);
  return key === 'neutral' ? colors.textDisabled : colors.status[key].solid;
}

/**
 * Rail marker per event class (story 7.10 UI revision): a plus circle for
 * `job_created`, a green tick for completed steps, a blue tick for
 * in-progress steps; cancellation and unknown event types keep the plain
 * colour dot. All styling via status tokens — no hard-coded colours.
 */
function railMarker(eventType: string) {
  if (eventType === 'job_created') {
    return (
      <View
        style={[
          styles.marker,
          {
            backgroundColor: colors.status.neutral.bg,
            borderColor: colors.status.neutral.border,
          },
        ]}>
        <Plus size={11} color={colors.status.neutral.fg} strokeWidth={2.5} />
      </View>
    );
  }
  if (eventType === 'step_completed') {
    return (
      <View
        style={[
          styles.marker,
          {
            backgroundColor: colors.status.done.bg,
            borderColor: colors.status.done.solid,
          },
        ]}>
        <Check size={11} color={colors.status.done.fg} strokeWidth={2.5} />
      </View>
    );
  }
  if (eventType.startsWith('step_')) {
    return (
      <View
        style={[
          styles.marker,
          {
            backgroundColor: colors.status.progress.bg,
            borderColor: colors.status.progress.solid,
          },
        ]}>
        <Check size={11} color={colors.status.progress.fg} strokeWidth={2.5} />
      </View>
    );
  }
  return <View style={[styles.dot, { backgroundColor: dotColor(eventType) }]} />;
}

/**
 * Location caption under a step row (story 7.10), straight-line distance
 * from the job site (haversine — NOT road distance). A captured fix with a
 * known job site renders as a pill chip (blue Badge + pin, the timeline's
 * only tinted element); everything else is plain text. Reasons are
 * server-authored, already human-readable sentences — rendered raw; an
 * unknown future reason renders raw too, never crash. `none` renders nothing
 * (pre-Epic-7 rows, non-location events) — the row stays exactly as before.
 */
type LocationCaption =
  | { kind: 'chip'; text: string; flagged: boolean }
  | { kind: 'text'; text: string };

function locationCaptionFor(
  entry: ActivityLogEntry,
  jobSite?: { latitude: number; longitude: number } | null,
): LocationCaption | null {
  const location = parseStepLocation(entry.metadata);
  if (location.kind === 'none') return null;
  if (location.kind === 'missed') {
    return {
      kind: 'text',
      text: location.reason
        ? `Location not captured — ${location.reason}`
        : 'Location not captured',
    };
  }
  if (!jobSite) return { kind: 'text', text: 'Location captured' };
  const metres = haversineMetres(jobSite, {
    latitude: location.latitude,
    longitude: location.longitude,
  });
  return { kind: 'chip', text: formatDistance(metres), flagged: location.flagged };
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

export function ActivityTimeline({ entries, workflowTemplate, jobSite }: Props) {
  return (
    <View style={{ marginTop: spacing.s2 }}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        return (
          <View style={styles.row} key={entry.id}>
            <View style={styles.rail}>
              {railMarker(entry.eventType)}
              {isLast ? null : <View style={styles.connector} />}
            </View>
            <View style={styles.content}>
              {/* Unknown event types render their raw value (never crash). */}
              <Text style={styles.label}>{resolveEventLabel(entry.eventType, workflowTemplate)}</Text>
              <Text style={styles.timestamp}>{timestampLabel(entry.createdAt)}</Text>
              {(() => {
                const caption = locationCaptionFor(entry, jobSite);
                if (!caption) return null;
                if (caption.kind === 'chip') {
                  return (
                    <View style={styles.captionRow}>
                      <Badge
                        status="progress"
                        tone="soft"
                        icon={
                          <EqualApproximately size={14} color={colors.status.progress.fg} />
                        }>
                        {caption.text}
                      </Badge>
                      {caption.flagged ? (
                        <Text style={styles.flagHint}>· low GPS accuracy</Text>
                      ) : null}
                    </View>
                  );
                }
                return <Text style={styles.caption}>{caption.text}</Text>;
              })()}
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
  // Icon marker (plus / tick circles) — taller than the plain dot, so it
  // sits 2px down to centre on the label's first line.
  marker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  connector: {
    width: 1,
    flex: 1,
    backgroundColor: colors.borderSubtle,
    marginTop: 2,
  },
  content: {
    flex: 1,
    marginLeft: spacing.s4,
    marginTop: -spacing.s1,
  },
  label: {
    ...typography.label,
    color: colors.textBody,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
  // Location caption (story 7.10) — same visual tier as the timestamp: the
  // distance is provenance metadata, not a headline. Captured fixes render
  // as a chip row (blue pill + pin); flagged fixes get a muted hint beside it.
  caption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.s1,
    marginTop: spacing.s2,
  },
  flagHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
