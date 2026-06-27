/**
 * Fenzit spacing & sizing tokens (ported for React Native).
 * 4px base grid. Generous touch targets for mobile (min 44px).
 * Values are in density-independent pixels (numbers, not rem strings).
 */
export const spacing = {
  s0: 0,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64,
  s20: 80,
} as const;

export const touch = {
  min: 44,
  comfort: 48,
  large: 56,
} as const;

export const layout = {
  gutterMobile: 16,
  gutterDesktop: 24,
  contentMax: 480,
  bottomNavH: 64,
  appBarH: 56,
} as const;
