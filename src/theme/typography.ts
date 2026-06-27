/**
 * Fenzit typography tokens (ported for React Native).
 *
 * Single family — Inter. React Native cannot use the variable .woff2 from
 * the web design system, so each weight maps to a static font family name
 * that must be bundled as a .ttf (see src/theme/fonts.ts and
 * react-native.config.js). Until the .ttf files are linked, RN falls back
 * to the platform system font, so the app keeps working.
 *
 * In RN there is no `font:` shorthand — text roles below expose the
 * individual properties (fontFamily, fontSize, fontWeight, lineHeight)
 * that you spread onto a <Text> style.
 */
import { fontFamily } from './fonts';

// Numeric weights kept for places that accept fontWeight directly.
export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extra: '800',
} as const;

// Type scale (px — RN uses density-independent pixels, not rem)
export const fontSize = {
  '2xs': 11,
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  '4xl': 48,
} as const;

// Line heights as multipliers (kept for reference / manual math)
export const leading = {
  tight: 1.2,
  snug: 1.35,
  normal: 1.5,
  relaxed: 1.65,
} as const;

export const letterSpacing = {
  tight: -0.02,
  snug: -0.01,
  normal: 0,
  wide: 0.02,
  caps: 0.06,
} as const;

/**
 * Semantic text roles. Spread one of these onto a Text style:
 *   <Text style={typography.title}>Today's jobs</Text>
 * RN needs an absolute lineHeight (px), so it is precomputed from the
 * scale * multiplier.
 */
export const typography = {
  display: {
    fontFamily: fontFamily.extra,
    fontSize: fontSize['4xl'],
    fontWeight: weight.extra,
    lineHeight: Math.round(fontSize['4xl'] * leading.tight),
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize['2xl'],
    fontWeight: weight.bold,
    lineHeight: Math.round(fontSize['2xl'] * leading.tight),
  },
  heading: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xl,
    fontWeight: weight.semibold,
    lineHeight: Math.round(fontSize.xl * leading.snug),
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.base,
    fontWeight: weight.regular,
    lineHeight: Math.round(fontSize.base * leading.normal),
  },
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    fontWeight: weight.regular,
    lineHeight: Math.round(fontSize.sm * leading.normal),
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    fontWeight: weight.medium,
    lineHeight: Math.round(fontSize.sm * leading.snug),
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    fontWeight: weight.regular,
    lineHeight: Math.round(fontSize.xs * leading.snug),
  },
} as const;
