/**
 * Fenzit design tokens for React Native.
 *
 * Import individual token groups, or the combined `theme` object:
 *   import { colors, spacing, typography } from '../theme';
 *   import { theme } from '../theme';
 */
export { colors, palette } from './colors';
export type { StatusKey } from './colors';
export { typography, fontSize, weight, leading, letterSpacing } from './typography';
export { fontFamily, monoFamily, INTER_LINKED } from './fonts';
export { spacing, touch, layout } from './spacing';
export { radius, shadow, motion } from './radius';

import { colors, palette } from './colors';
import { typography, fontSize, weight, leading, letterSpacing } from './typography';
import { fontFamily } from './fonts';
import { spacing, touch, layout } from './spacing';
import { radius, shadow, motion } from './radius';

export const theme = {
  colors,
  palette,
  typography,
  fontSize,
  weight,
  leading,
  letterSpacing,
  fontFamily,
  spacing,
  touch,
  layout,
  radius,
  shadow,
  motion,
} as const;

export type Theme = typeof theme;
