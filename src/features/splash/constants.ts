/**
 * Shared geometry for the animated splash scene.
 */
import { radius } from '../../theme';

export const CARD = 160;
export const INNER = 120; // == native logoWidth, so the colored F overlays the white F
export const RADIUS = radius['2xl'];
export const HALO = Math.round(CARD * 1.75);
export const BLOB = Math.round(CARD * 0.95);
export const BLOB_OFFSET = (CARD - BLOB) / 2;
