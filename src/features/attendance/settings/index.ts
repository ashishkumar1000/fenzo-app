/**
 * features/attendance/settings — Attendance settings surface (Story 15-6).
 *
 * Exports only the screens the nav graph registers. Everything else in
 * this folder (hooks, sheets, model helpers) is implementation detail
 * consumed via direct relative imports — the barrel stays narrow so it
 * doesn't leak internals (15-6 review finding P14).
 */
export { default as SettingsScreen } from './SettingsScreen';
export { default as WeeklyOffScreen } from './WeeklyOffScreen';
export { default as HolidaysScreen } from './HolidaysScreen';