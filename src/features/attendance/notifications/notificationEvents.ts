/**
 * Attendance notification event registry — FE mirror of the BE source of
 * truth (`fenzit-be/src/attendance/notification-events.ts`, AD-13).
 *
 * Why this file exists
 * ─────────────────────
 * The backend publishes the canonical event-type strings, payload field
 * names, and dedupe-key shapes for every `attendance.*` notification.
 * 15-6 ships the first two (holiday_added, holiday_removed). Every later
 * attendance/leave emitter (16 fake-location, 17 leave lifecycle, 19
 * reminders) extends THIS list on both sides in the same commit — the FE
 * side mirrors the BE side character-for-character. Story 19-4 (the FE
 * half of 19-1) adds the three reminders. HONEST MIRROR FACT: the FE mirror
 * is still BEHIND the BE by one event — `attendance.fake_location` (16)
 * was never mirrored FE-side and stays deliberately absent here (its ack
 * UI is 18-2's affair); the mirror tests pin the RESIDUAL gap too.
 *
 * If a field here drifts from the BE registry, the FE renders the wrong
 * row or the BE's dedupe index swallows a notification the user expected
 * to see. The 15-6 test (`notificationEvents.test.ts`) pins every public
 * value against hand-transcribed literals, and every exported object is
 * runtime-frozen (`Object.freeze`, 15-6 review) — so the mirror can only
 * change by an explicit edit that the pinned tests then catch.
 *
 * The FE has no UI surface consuming this list today — this file is the
 * source of truth for the 16+ emitters. The export shape lets the rest of
 * the app import the constants without depending on the backend's
 * filesystem path.
 */

export const ATTENDANCE_NOTIFICATION_EVENT = Object.freeze({
  /** A future-dated holiday was added — one row per tracked employee. */
  HOLIDAY_ADDED: 'attendance.holiday_added',
  /** A future-dated holiday was removed — one row per tracked employee. */
  HOLIDAY_REMOVED: 'attendance.holiday_removed',
  /** The employee's own check-in nudge (FR-23) — at most once per day. */
  REMINDER_CHECKIN: 'attendance.reminder_checkin',
  /** The employee's own check-out nudge — once, per work_date with a
   *  check-in and no checkout. */
  REMINDER_CHECKOUT: 'attendance.reminder_checkout',
  /** The OWNER's office summary (19-2): tracked employees unchecked in. */
  REMINDER_NOT_CHECKED_IN: 'attendance.reminder_not_checked_in',
} as const);

export type AttendanceNotificationEvent =
  (typeof ATTENDANCE_NOTIFICATION_EVENT)[keyof typeof ATTENDANCE_NOTIFICATION_EVENT];

/** The polymorphic deep-link kind for every attendance.* notification. */
export const ATTENDANCE_ENTITY_TYPE = 'attendance';

/**
 * Registry entry metadata. `payloadFields` is the self-contained camelCase
 * payload the FE renders from — the row must survive without its entity.
 */
export interface AttendanceNotificationEventMeta {
  /** The notifications.event_type string. */
  eventType: AttendanceNotificationEvent;
  /** Who receives it (prose — the recipient predicate lives in the RPC). */
  recipients: string;
  /** camelCase payload keys, in payload order. */
  payloadFields: readonly string[];
  /**
   * Dedupe-key shape (the 14-2 recipient-prefixed convention — the partial
   * unique index is global on dedupe_key alone, so the recipient MUST be
   * embedded or a multi-recipient fan-out collides).
   */
  dedupeKeyShape: string;
}

/**
 * Freeze one registry entry (the meta object AND its payloadFields array)
 * at runtime, so no consumer can mutate the mirror in place — extending
 * it means adding an entry, which the pinned tests then hold to the BE.
 */
function frozenEntry(
  meta: AttendanceNotificationEventMeta,
): AttendanceNotificationEventMeta {
  return Object.freeze({
    ...meta,
    payloadFields: Object.freeze([...meta.payloadFields]),
  });
}

export const ATTENDANCE_NOTIFICATION_EVENT_REGISTRY: Readonly<
  Record<AttendanceNotificationEvent, AttendanceNotificationEventMeta>
> = Object.freeze({
  [ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_ADDED]: frozenEntry({
    eventType: ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_ADDED,
    recipients:
      'Employees tracked (enrolled, enrolment covering the holiday date) on the day the holiday is added; setup must be completed. Future dates only.',
    payloadFields: ['holidayName', 'holidayDate'],
    dedupeKeyShape:
      '<tenantId>:attendance.holiday_added:<recipientId>:<holidayId>',
  }),
  [ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_REMOVED]: frozenEntry({
    eventType: ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_REMOVED,
    recipients:
      'Employees tracked on the removed holiday date; future dates only (past removals are silent — statuses recompute on read).',
    payloadFields: ['holidayName', 'holidayDate'],
    dedupeKeyShape:
      '<tenantId>:attendance.holiday_removed:<recipientId>:<holidayId>',
  }),
  [ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKIN]: frozenEntry({
    eventType: ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKIN,
    recipients:
      'A tracked employee, at most once per work_date (FR-23); never on weekly offs, holidays, an approved full-day leave, the enable-day grace or a status-only day override.',
    payloadFields: ['workDate'],
    dedupeKeyShape:
      '<tenantId>:attendance.reminder_checkin:<recipientId>:<workDate>',
  }),
  [ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKOUT]: frozenEntry({
    eventType: ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKOUT,
    recipients:
      'A tracked employee with a check-in and no check-out by the due instant, at most once per work_date.',
    payloadFields: ['workDate', 'checkinAt'],
    dedupeKeyShape:
      '<tenantId>:attendance.reminder_checkout:<recipientId>:<workDate>',
  }),
  [ATTENDANCE_NOTIFICATION_EVENT.REMINDER_NOT_CHECKED_IN]: frozenEntry({
    eventType: ATTENDANCE_NOTIFICATION_EVENT.REMINDER_NOT_CHECKED_IN,
    recipients:
      "The tenant owner, once per office per day at that office’s Start + Late cut-off, when the office has tracked employees with no check-in and no approved full-day leave.",
    payloadFields: ['officeName', 'notCheckedInCount', 'workDate'],
    dedupeKeyShape:
      '<tenantId>:attendance.reminder_not_checked_in:<recipientId>:<workDate>:<officeId>',
  }),
});

/** Every registered event type (handy for FE-mirror diff tests). Frozen —
 *  extend the event map above, never this list (15-6 review). */
export const ATTENDANCE_NOTIFICATION_EVENT_TYPES: readonly AttendanceNotificationEvent[] =
  Object.freeze(Object.values(ATTENDANCE_NOTIFICATION_EVENT));
