/**
 * features/attendance/me — the technician's own attendance surfaces
 * (Story 15-10): the access store (AD-17), the FR-4 intro, and the
 * Attendance tab's state screens.
 */
export { default as AttendanceTabScreen } from './AttendanceTabScreen';
export { default as AttendanceIntroScreen } from './AttendanceIntroScreen';
export {
  useAttendanceAccessLifecycle,
  useAttendanceAccess,
} from './attendanceAccessStore';
