/**
 * Profile feature — the signed-in user's own account data (`GET /users/me`),
 * shared by Home, More and the technician Profile tab, plus the name-edit
 * sheet those surfaces share.
 */
export {
  useMyProfile,
  loadMyProfile,
  setProfileFromServer,
} from './useMyProfile';
export { EditNameSheet } from './components/EditNameSheet';
export type { MyProfileState } from './useMyProfile';
export { firstName, formatPhone, formatRole } from './format';
