/**
 * features/attendance/setup — the 15-8 first-run setup wizard barrel.
 *
 * Exports only the screen the nav graph registers; the model, hooks and
 * step components are implementation detail consumed via direct relative
 * imports (the narrow-barrel rule from the 15-6 review).
 */
export { default as SetupWizardScreen } from './SetupWizardScreen';
