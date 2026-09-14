/**
 * The viewer's backdrop token (Story 9-1, Task 2) must exist on the theme —
 * the viewer references only the token, never a raw rgba.
 */
import { colors } from './colors';

describe('colors.backdropDark', () => {
  it('exports the full-screen image viewer backdrop token', () => {
    expect(colors.backdropDark).toBe('rgba(17, 24, 39, 0.96)');
  });
});
