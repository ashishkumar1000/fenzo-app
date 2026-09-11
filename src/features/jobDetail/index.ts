/**
 * Job detail feature — public surface. The screen is registered on the root
 * stack (see `navigation/RootNavigator.tsx`); the event-label helper is
 * re-exported here. The timeline/attachment components stay internal —
 * Story 3.2 imports them directly from this feature's `components/` folder.
 */
export { default as JobDetailScreen } from './JobDetailScreen';
export { eventLabel } from './eventLabels';