/**
 * Fenzit color tokens (ported from the Fenzit Design System).
 *
 * Raw scales + semantic aliases. Components should reference the semantic
 * aliases (colors.primary, colors.surfaceCard, colors.status.done.bg, ...),
 * never the raw scales directly.
 *
 * Brand anchors: Primary #1A56DB · Done #06956F ·
 * Scheduled #D97706 · Background #F9FAFB · Text #111827
 */

// ---- Raw scales ----
export const palette = {
  // Primary (Fenzit Blue · "in progress")
  blue50: '#EFF4FE',
  blue100: '#DBE6FD',
  blue200: '#BFD0FB',
  blue300: '#93B0F7',
  blue400: '#5E84F0',
  blue500: '#3568E5',
  blue600: '#1A56DB', // brand primary
  blue700: '#1645B2',
  blue800: '#163C92',
  blue900: '#163576',

  // Green (Done / Success)
  green50: '#E9F8F3',
  green100: '#C9EEE2',
  green200: '#97DEC8',
  green300: '#5BC7A8',
  green400: '#21AB87',
  green500: '#06956F', // brand success
  green600: '#057B5C',
  green700: '#06624A',
  green800: '#084E3C',
  green900: '#083F31',

  // Amber (Pending / Scheduled / Warning)
  amber50: '#FEF6EB',
  amber100: '#FCE8CC',
  amber200: '#F9CF94',
  amber300: '#F5B056',
  amber400: '#EE9322',
  amber500: '#D97706', // brand warning
  amber600: '#B65F05',
  amber700: '#92490A',
  amber800: '#783C0F',
  amber900: '#653210',

  // Red (Cancelled / Danger)
  red50: '#FEF2F2',
  red100: '#FDE0E0',
  red200: '#FBC7C7',
  red300: '#F7A1A1',
  red400: '#F06A6A',
  red500: '#E13D3D',
  red600: '#C92A2A', // brand danger
  red700: '#A61F1F',
  red800: '#891E1E',
  red900: '#721E1E',

  // Neutral (gray)
  gray0: '#FFFFFF',
  gray50: '#F9FAFB', // brand background
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827', // brand text
} as const;

// ---- Semantic aliases ----
export const colors = {
  // Brand
  primary: palette.blue600,
  primaryHover: palette.blue700,
  primaryActive: palette.blue800,
  primarySoft: palette.blue50,
  onPrimary: palette.gray0,

  // Surfaces
  surfacePage: palette.gray50,
  surfaceCard: palette.gray0,
  surfaceSunken: palette.gray100,
  surfaceInverse: palette.gray900,

  // Scrim — modal / sheet backdrop overlay (gray900 @ 45% alpha).
  scrim: 'rgba(17, 24, 39, 0.45)',

  // Text
  textStrong: palette.gray900,
  textBody: palette.gray700,
  textMuted: palette.gray500,
  textDisabled: palette.gray400,
  textOnColor: palette.gray0,
  textLink: palette.blue600,

  // Borders & dividers
  borderSubtle: palette.gray200,
  borderDefault: palette.gray300,
  borderStrong: palette.gray400,
  borderFocus: palette.blue600,

  // Feedback
  success: palette.green500,
  warning: palette.amber500,
  danger: palette.red600,
  info: palette.blue600,

  // Focus ring color (used with shadow on web; border emphasis on native)
  ringFocus: palette.blue200,

  // Status — the heart of Fenzit (badges everywhere)
  status: {
    done: {
      fg: palette.green700,
      bg: palette.green50,
      solid: palette.green500,
      border: palette.green200,
    },
    progress: {
      fg: palette.blue700,
      bg: palette.blue50,
      solid: palette.blue600,
      border: palette.blue200,
    },
    scheduled: {
      fg: palette.amber700,
      bg: palette.amber50,
      solid: palette.amber500,
      border: palette.amber200,
    },
    cancelled: {
      fg: palette.red700,
      bg: palette.red50,
      solid: palette.red600,
      border: palette.red200,
    },
    neutral: {
      fg: palette.gray600,
      bg: palette.gray100,
      solid: palette.gray500,
      border: palette.gray200,
    },
  },
} as const;

export type StatusKey = keyof typeof colors.status;
