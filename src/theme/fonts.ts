/**
 * Inter font family wiring for React Native.
 *
 * The Fenzit web design system ships Inter as a variable .woff2, which RN
 * cannot load. RN needs static .ttf/.otf files, one per weight, linked via
 * react-native.config.js + `npx react-native-asset`.
 *
 * SETUP (one time):
 *   1. Add these files to src/assets/fonts/ (download from
 *      https://fonts.google.com/specimen/Inter — "Static" download):
 *        Inter-Regular.ttf   (400)
 *        Inter-Medium.ttf    (500)
 *        Inter-SemiBold.ttf  (600)
 *        Inter-Bold.ttf      (700)
 *        Inter-ExtraBold.ttf (800)
 *   2. Run:  npx react-native-asset
 *   3. Rebuild the app (bun ios / bun android).
 *   4. Flip INTER_LINKED to `true` below.
 *
 * Until then, INTER_LINKED stays false and text uses the platform system
 * font (San Francisco on iOS, Roboto on Android) so the app still renders.
 *
 * The fontFamily name on iOS is the font's PostScript name; on Android it is
 * the file name without extension. Using the names below ("Inter-Bold" etc.)
 * keeps both platforms consistent when the static files follow this naming.
 */

// Flip to true once the Inter .ttf files are added and linked.
export const INTER_LINKED = false;

type FontWeightName = 'regular' | 'medium' | 'semibold' | 'bold' | 'extra';

const interFamilies: Record<FontWeightName, string> = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  extra: 'Inter-ExtraBold',
};

/**
 * Resolved family names used by the typography tokens. When INTER_LINKED is
 * false these are `undefined`, which tells RN to use the system font while
 * still honoring the numeric fontWeight set alongside it.
 */
export const fontFamily: Record<FontWeightName, string | undefined> = INTER_LINKED
  ? interFamilies
  : {
      regular: undefined,
      medium: undefined,
      semibold: undefined,
      bold: undefined,
      extra: undefined,
    };

/**
 * Monospace family (for tabular/code contexts — the DS exposes --font-mono).
 * RN maps to the platform default monospace face: "Menlo" on iOS, "monospace"
 * on Android. Use Platform.select at the call site if you need this.
 */
export const monoFamily = 'monospace';
