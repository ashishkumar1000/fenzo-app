/**
 * Tests for the FE notification-registry mirror (Story 15-6, AD-13).
 *
 * The backend publishes the canonical event-type strings, payload field
 * names, and dedupe-key shapes for every `attendance.*` notification. The
 * FE mirror exists so 16+ emitters can import the constants without
 * reaching into the BE filesystem. If any value here drifts from the BE
 * registry, the FE renders the wrong row or the BE's dedupe index swallows
 * a notification the user expected.
 *
 * These tests pin every public value against literals hand-transcribed
 * from the BE registry (`fenzit-be/src/attendance/notification-events.ts`)
 * and assert the exported objects are runtime-frozen — the mirror can
 * only change by an explicit edit, which the pinned literals then catch.
 */
import {
  ATTENDANCE_ENTITY_TYPE,
  ATTENDANCE_NOTIFICATION_EVENT,
  ATTENDANCE_NOTIFICATION_EVENT_REGISTRY,
  ATTENDANCE_NOTIFICATION_EVENT_TYPES,
} from './notificationEvents';

describe('ATTENDANCE_NOTIFICATION_EVENT constants', () => {
  it('HOLIDAY_ADDED matches the BE-pinned dotted event type', () => {
    expect(ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_ADDED)
      .toBe('attendance.holiday_added');
  });

  it('HOLIDAY_REMOVED matches the BE-pinned dotted event type', () => {
    expect(ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_REMOVED)
      .toBe('attendance.holiday_removed');
  });
});

describe('ATTENDANCE_ENTITY_TYPE', () => {
  it('is the polymorphic deep-link kind "attendance"', () => {
    expect(ATTENDANCE_ENTITY_TYPE).toBe('attendance');
  });
});

describe('ATTENDANCE_NOTIFICATION_EVENT_REGISTRY', () => {
  it('has an entry for every defined event type (no orphan rows, no missing rows)', () => {
    const types = ATTENDANCE_NOTIFICATION_EVENT_TYPES;
    expect(Object.keys(ATTENDANCE_NOTIFICATION_EVENT_REGISTRY).sort())
      .toEqual([...types].sort());
  });

  it('HOLIDAY_ADDED: eventType / payloadFields / dedupeKeyShape are pinned', () => {
    const meta = ATTENDANCE_NOTIFICATION_EVENT_REGISTRY[
      ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_ADDED
    ];
    expect(meta.eventType).toBe('attendance.holiday_added');
    expect(meta.payloadFields).toEqual(['holidayName', 'holidayDate']);
    // Dedupe key is recipient-prefixed (14-2) — tenant, event, recipient,
    // holiday — in that order, colon-separated.
    expect(meta.dedupeKeyShape)
      .toBe('<tenantId>:attendance.holiday_added:<recipientId>:<holidayId>');
    expect(meta.recipients).toMatch(/Employees tracked/);
    expect(meta.recipients.toLowerCase()).toContain('future dates only');
  });

  it('HOLIDAY_REMOVED: eventType / payloadFields / dedupeKeyShape are pinned', () => {
    const meta = ATTENDANCE_NOTIFICATION_EVENT_REGISTRY[
      ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_REMOVED
    ];
    expect(meta.eventType).toBe('attendance.holiday_removed');
    expect(meta.payloadFields).toEqual(['holidayName', 'holidayDate']);
    expect(meta.dedupeKeyShape)
      .toBe('<tenantId>:attendance.holiday_removed:<recipientId>:<holidayId>');
    // The prose reads "future dates only (past removals are silent …)".
    expect(meta.recipients.toLowerCase()).toContain('future dates only');
  });

  it('every entry\'s eventType matches its registry key', () => {
    // Catches the easy drift where someone adds a new event type to the
    // union but forgets to align the eventType field on the meta entry.
    for (const [key, meta] of Object.entries(ATTENDANCE_NOTIFICATION_EVENT_REGISTRY)) {
      expect(meta.eventType).toBe(key);
    }
  });
});

describe('ATTENDANCE_NOTIFICATION_EVENT_TYPES', () => {
  it('exports every registered event type as a frozen list', () => {
    expect(ATTENDANCE_NOTIFICATION_EVENT_TYPES).toEqual([
      'attendance.holiday_added',
      'attendance.holiday_removed',
    ]);
    expect(Object.isFrozen(ATTENDANCE_NOTIFICATION_EVENT_TYPES)).toBe(true);
  });
});

describe('runtime freezing (15-6 review — the mirror cannot be mutated in place)', () => {
  it('the event map, registry record and TYPES list are Object.frozen', () => {
    expect(Object.isFrozen(ATTENDANCE_NOTIFICATION_EVENT)).toBe(true);
    expect(Object.isFrozen(ATTENDANCE_NOTIFICATION_EVENT_REGISTRY)).toBe(true);
    expect(Object.isFrozen(ATTENDANCE_NOTIFICATION_EVENT_TYPES)).toBe(true);
  });

  it('each registry entry and its payloadFields are frozen (deep)', () => {
    for (const meta of Object.values(ATTENDANCE_NOTIFICATION_EVENT_REGISTRY)) {
      expect(Object.isFrozen(meta)).toBe(true);
      expect(Object.isFrozen(meta.payloadFields)).toBe(true);
    }
  });

  it('a mutation attempt throws (strict mode) and the mirror is unchanged', () => {
    const before = ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_ADDED;
    const map = ATTENDANCE_NOTIFICATION_EVENT as unknown as Record<string, string>;
    // Frozen-object mutation only throws in strict mode, and babel-compiled
    // CJS test bodies run sloppy — so the arrow declares its own strict-mode
    // directive (a directive prologue applies to that function alone). The
    // assertion would silently pass otherwise, which is worse than no test.
    expect(() => {
      'use strict';
      map.HOLIDAY_ADDED = 'attendance.drifted';
    }).toThrow();
    expect(ATTENDANCE_NOTIFICATION_EVENT.HOLIDAY_ADDED).toBe(before);
  });
});
