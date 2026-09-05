/**
 * TechJobDetailContent — the loaded job's cards, top to bottom (spec §8):
 * Progress (stepper), Customer, Job details, Notes from owner (amber),
 * Photos (3.4's slot), Customer signature, History disclosure. Render-only
 * this story: stepper interactivity is 3.3, capture slots are 3.4/3.5.
 *
 * Purely presentational — the screen owns the fetch and the header.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Droplet,
  MapPin,
  Navigation,
  PenLine,
  Snowflake,
  Wrench,
} from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../../theme';
import type { JobDetail } from '../../../services';
import { openMaps } from '../../../utils/linking';
import { PersonRow } from '../../jobDetail/components/PersonRow';
import { ActivityTimeline } from '../../jobDetail/components/ActivityTimeline';
import { formatPhone } from '../../profile';
import {
  formatTimeLabel,
  serviceTypeLabel,
  serviceTypeToIcon,
} from '../../jobs/format';
import { STEP_ORDER, buildStepper, type WorkflowStep } from '../stepperModel';
import { WorkflowStepper } from './WorkflowStepper';
import { SignatureTile } from './SignatureTile';
import { PhotoSection } from './PhotoSection';

const SERVICE_ICON = {
  wrench: Wrench,
  droplet: Droplet,
  snowflake: Snowflake,
} as const;

/** "12 Aug 2026" — the date line's format (spec §0). Unparseable input → raw. */
function dateLine(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type Props = {
  detail: JobDetail;
  /** 3.3 — wired to the screen's advance; absent → the stepper renders read-only. */
  onAdvance?: (step: WorkflowStep) => void;
  /** 3.3 — the step whose advance request is in flight (subtle pressed state). */
  pendingStep?: WorkflowStep | null;
  /** 3.4 — fired per confirmed photo upload (the screen's silent refetch). */
  onPhotosConfirmed?: () => void;
};

export function TechJobDetailContent({ detail, onAdvance, pendingStep, onPhotosConfirmed }: Props) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const isTerminal = detail.status === 'completed' || detail.status === 'cancelled';
  const steps = buildStepper(detail, detail.activityLog);
  const doneCount = steps.filter(s => s.state === 'done').length;
  const photos = detail.attachments.filter(a => a.type === 'photo');
  const signature = detail.attachments.find(a => a.type === 'signature') ?? null;
  const description = detail.description;
  const customerAddress = detail.customer.address;
  const customerCity = detail.customer.city;

  // The service-type glyph — icon name mapped to the actual lucide component.
  const ServiceIcon = SERVICE_ICON[serviceTypeToIcon(detail.serviceType)];

  return (
    <>
      {/* 1. Progress — the stepper is the story of the job; "N of 6" counts
          finished steps, collapsing to "Done" when complete. */}
      <Card padding="md" style={styles.cardGap}>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>Progress</Text>
          <Text style={styles.progressCount}>
            {detail.status === 'completed' ? 'Done' : `${doneCount} of ${STEP_ORDER.length}`}
          </Text>
        </View>
        <WorkflowStepper steps={steps} onAdvance={onAdvance} pendingStep={pendingStep} />
      </Card>

      {/* 2. Customer — the phone affordance lives in PersonRow; the address
          row (when there is one) opens the maps app. */}
      <Card padding="md">
        <Text style={styles.sectionTitle}>Customer</Text>
        <PersonRow
          name={detail.customer.name}
          countryCode={detail.customer.countryCode}
          phoneNumber={detail.customer.phoneNumber}
          subLine={formatPhone(detail.customer)}
        />
        {customerAddress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open in maps"
            onPress={() => void openMaps(customerAddress, customerCity)}
            style={styles.mapsRow}>
            <MapPin size={15} color={colors.primary} strokeWidth={2} />
            <Text style={styles.mapsText} numberOfLines={2}>
              {[customerAddress, customerCity].filter(Boolean).join(', ')}
            </Text>
            <Navigation size={15} color={colors.primary} strokeWidth={2} />
          </Pressable>
        ) : null}
      </Card>

      {/* 3. Job details — schedule + service meta, description behind a
          divider. */}
      <Card padding="md">
        <Text style={styles.sectionTitle}>Job details</Text>
        <View style={styles.metaRow}>
          <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.metaText}>{dateLine(detail.scheduledStart)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Clock size={15} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.metaText}>
            {formatTimeLabel(detail.scheduledStart, detail.scheduledEnd)}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <ServiceIcon size={15} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.metaText}>{serviceTypeLabel(detail.serviceType)}</Text>
        </View>
        {description ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.bodyText}>{description}</Text>
          </>
        ) : null}
      </Card>

      {/* 4. Notes from owner — the amber tint says "read this before
          starting" (spec §8); only rendered when notes exist. */}
      {detail.notesForTechnician ? (
        <Card padding="md" style={styles.notesCard}>
          <Text style={styles.notesTitle}>Notes from owner</Text>
          <Text style={styles.bodyText}>{detail.notesForTechnician}</Text>
        </Card>
      ) : null}

      {/* 5. Photos — the capture slot (3.4). Present on non-terminal jobs even
          when empty (the add tile invites); a finished job with no photos has
          nothing to show. Terminal jobs render the captured photos read-only. */}
      {!isTerminal || photos.length > 0 ? (
        <Card padding="md">
          <Text style={styles.sectionTitle}>Photos</Text>
          <PhotoSection
            jobId={detail.id}
            photos={photos}
            readOnly={isTerminal}
            onConfirmed={onPhotosConfirmed}
          />
        </Card>
      ) : null}

      {/* 6. Customer signature — the captured tile, or the dashed placeholder
          until 3.5 fills it. Always rendered (spec §8 defines only
          tile-or-placeholder — a cancelled job that never reached the
          signature step still shows the placeholder). */}
      <Card padding="md">
        <Text style={styles.sectionTitle}>Customer signature</Text>
        {signature ? (
          // Keyed by the presigned URL: a refetch that mints a new one
          // remounts the tile, clearing any failed state from the old URL.
          <SignatureTile key={signature.url ?? 'none'} attachment={signature} />
        ) : (
          <View style={styles.signaturePlaceholder}>
            <PenLine size={20} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.signaturePlaceholderText}>
              Captured at the signature step.
            </Text>
          </View>
        )}
      </Card>

      {/* 7. History — collapsed by default; the disclosure keeps the scroll
          focused on what's actionable. The timeline renders nothing when the
          log is empty (no invented copy). */}
      <Card padding="md">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isHistoryOpen }}
          accessibilityLabel={isHistoryOpen ? 'Hide history' : 'Show history'}
          onPress={() => setIsHistoryOpen(open => !open)}
          style={styles.historyRow}>
          <Text style={styles.sectionTitle}>History</Text>
          {isHistoryOpen ? (
            <ChevronUp size={20} color={colors.textMuted} strokeWidth={2} />
          ) : (
            <ChevronDown size={20} color={colors.textMuted} strokeWidth={2} />
          )}
        </Pressable>
        {isHistoryOpen ? <ActivityTimeline entries={detail.activityLog} /> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  cardGap: {
    gap: spacing.s2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s2,
  },
  progressLabel: {
    ...typography.labelStrong,
    color: colors.textMuted,
  },
  progressCount: {
    ...typography.labelStrong,
    color: colors.status.progress.fg,
  },
  sectionTitle: {
    ...typography.heading,
    fontSize: 16,
    lineHeight: 20,
    color: colors.textStrong,
    marginBottom: spacing.s2,
  },
  mapsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: touch.min,
    marginTop: spacing.s1,
  },
  mapsText: {
    ...typography.bodySm,
    color: colors.textLink,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  metaText: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginTop: spacing.s1,
  },
  bodyText: {
    ...typography.body,
    color: colors.textBody,
    marginTop: spacing.s2,
  },
  // Amber tint (spec §8): the "read this before starting" card.
  notesCard: {
    backgroundColor: colors.status.scheduled.bg,
    borderColor: colors.status.scheduled.border,
    borderWidth: 1,
  },
  notesTitle: {
    ...typography.heading,
    fontSize: 16,
    lineHeight: 20,
    color: colors.status.scheduled.fg,
    marginBottom: spacing.s2,
  },
  // The "until 3.5 fills it" placeholder (spec §8): dashed, muted.
  signaturePlaceholder: {
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
  },
  signaturePlaceholderText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touch.min,
  },
});
