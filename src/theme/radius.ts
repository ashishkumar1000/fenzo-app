/**
 * Fenzit radius, elevation & motion tokens (ported for React Native).
 *
 * Web box-shadows are translated to RN's shadow props (iOS) plus an
 * `elevation` value (Android). Each shadow token is an object you spread
 * onto a View style.
 */
import { palette } from './colors';

export const radius = {
  xs: 4,
  sm: 6,
  md: 10, // default control / input
  lg: 14, // cards
  xl: 20, // sheets, modals
  '2xl': 28,
  pill: 999, // badges, chips, avatars
} as const;

// Shadow color is the cool-gray brand ink (#111827 = palette.gray900).
const ink = palette.gray900;

export const shadow = {
  xs: {
    shadowColor: ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: ink,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
  // Bottom sheet — upward shadow.
  sheet: {
    shadowColor: ink,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 12,
  },
  // Primary button lift (blue-tinted).
  primary: {
    shadowColor: palette.blue600,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
} as const;

// Motion — durations (ms) and easing curves.
// In RN, use these with the Easing API, e.g.:
//   import { Easing } from 'react-native';
//   Easing.bezier(...motion.easeStandard)
export const motion = {
  durationFast: 120,
  durationBase: 200,
  durationSlow: 320,
  // cubic-bezier control points (x1, y1, x2, y2)
  easeStandard: [0.2, 0, 0, 1] as const,
  easeOut: [0.16, 1, 0.3, 1] as const,
} as const;

