/**
 * services/resources/index.ts
 * ────────────────────────────
 * Every resource's API service, in one place. When you add a new resource:
 *
 *   1. Create `services/resources/<resource>.ts` (copy `technicians.ts` as
 *      a template).
 *   2. Add one line here: `export { fooService } from './foo';`
 *
 * Features never import a resource file directly — they go through the
 * top-level `@services` barrel, which re-exports everything from here.
 */
export { attachmentService } from './attachments';
export type {
  AttachmentPresignBody,
  ConfirmResponse,
  PresignResponse,
} from './attachments';
export { technicianService } from './technicians';
export { placesService } from './places';
export type { PlaceSuggestion, ResolvedPlace, ReverseGeocodedAddress } from './places';
export { officesService } from './offices';
export type {
  CreateOfficeRequest,
  Office,
  OfficeArchiveBlocker,
  OfficeDetail,
  OfficeRule,
  PickedOfficeLocation,
  UpdateOfficeRequest,
} from './offices';
export { weeklyOffsService } from './weeklyOffs';
export type {
  IsoWeekday,
  SetWeeklyOffRequest,
  WeeklyOffDefaultResponse,
  WeeklyOffOverrideResponse,
  WeeklyOffView,
} from './weeklyOffs';
export { holidaysService } from './holidays';
export type {
  CreateHolidayRequest,
  Holiday,
  HolidayImpactResponse,
  UpdateHolidayRequest,
} from './holidays';
export { attendanceSetupService } from './attendanceSetup';
export type { SetupState, SetupStep } from './attendanceSetup';
export { attendanceMeService } from './attendanceMe';
export type {
  AttendanceAccess,
  AttendanceAccessState,
  AttendanceSummary,
} from './attendanceMe';
export { enrolmentsService } from './enrolments';
export type { EnrolmentOverview, EnrolmentWriteState } from './enrolments';
export { customerService } from './customers';
export type {
  ApiCustomer,
  CreateCustomerRequest,
  CreatedCustomer,
  CustomerDetail,
  JobHistoryItem,
} from './customers';
export { jobService } from './jobs';
export type {
  ActivityLogEntry,
  ApiJob,
  CreateJobRequest,
  JobAttachment,
  JobDetail,
  JobDetailCustomer,
  JobDetailTechnician,
  JobPriority,
  JobScope,
  JobServiceType,
  JobStatusApi,
  ListJobsQuery,
  UpdateJobEditFields,
  UpdateJobRequest,
  WorkflowTemplate,
  WorkflowTemplateStep,
} from './jobs';
export { skillService } from './skills';
export type { Skill, NewSkillInput } from './skills';
export { notificationService } from './notifications';
export type { ApiNotification, ListNotificationsQuery } from './notifications';
export { reportService, TECHNICIAN_JOB_ACTIVITY_TYPE } from './reports';
export type {
  CreateReportRequest,
  CreateReportResponse,
  ReportListItem,
  ReportRequestStatus,
  ReportStatusResponse,
} from './reports';
export { authApi } from './authApi';
export { usersApi } from './users';
export type {
  MyProfile,
  ProfileTenant,
  ProfileTechnician,
  ProfileTechnicianSummary,
  ProfileCustomerSummary,
  ProfileJob,
  JobCounts,
  UserStatus,
} from './users';
export type {
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  VerifiedUser,
  UserRole,
  SetupCompanyRequest,
  SetupCompanyResponse,
  Tenant,
} from './authApi';

