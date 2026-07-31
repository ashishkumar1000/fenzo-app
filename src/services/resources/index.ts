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
export { technicianService } from './technicians';
export { customerService } from './customers';
export type { ApiCustomer, CreateCustomerRequest, CreatedCustomer } from './customers';
export { jobService } from './jobs';
export type {
  CreateJobRequest,
  CreatedJob,
  JobPriority,
  JobServiceType,
} from './jobs';
export { skillService } from './skills';
export type { Skill, NewSkillInput } from './skills';
export { authApi } from './authApi';
export { usersApi } from './users';
export type {
  MyProfile,
  ProfileTenant,
  ProfileTechnician,
  JobStatusCounts,
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

