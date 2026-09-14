/**
 * Tests for the haversine distance helper and its display formatter
 * (story 7.10): the timeline caption shows the straight-line distance
 * between the technician's captured GPS fix and the job site.
 */
import { formatDistance, haversineMetres } from './distanceUtils';

describe('haversineMetres', () => {
  it('returns 0 for the same point', () => {
    const point = { latitude: 12.9716, longitude: 77.5946 };
    expect(haversineMetres(point, point)).toBe(0);
  });

  it('treats a 0.001° latitude separation as ~111 m', () => {
    const a = { latitude: 12.9716, longitude: 77.5946 };
    const b = { latitude: 12.9726, longitude: 77.5946 };
    const metres = haversineMetres(a, b);
    // One degree of latitude ≈ 111.19 km → 0.001° ≈ 111.19 m.
    expect(metres).toBeGreaterThan(109);
    expect(metres).toBeLessThan(113);
  });

  it('scales correctly for a larger separation (~1° ≈ 111 km)', () => {
    const a = { latitude: 12, longitude: 77 };
    const b = { latitude: 13, longitude: 77 };
    const metres = haversineMetres(a, b);
    expect(metres).toBeGreaterThan(110_000);
    expect(metres).toBeLessThan(112_500);
  });

  it('survives an antipodal pair without NaN or overflow', () => {
    const metres = haversineMetres(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 180 },
    );
    // Half the Earth's circumference ≈ 20,015 km; small model spread is fine.
    expect(metres).toBeGreaterThan(19_900_000);
    expect(metres).toBeLessThan(20_200_000);
  });
});

describe('formatDistance', () => {
  it('formats sub-kilometre distances in whole tens of metres', () => {
    expect(formatDistance(0)).toBe('0 m away');
    expect(formatDistance(120)).toBe('120 m away');
    // Rounds to the nearest 10 — a 3-metre-precise number implies GPS
    // precision it does not have.
    expect(formatDistance(124)).toBe('120 m away');
  });

  it('stays in metres right up to the 1 km boundary', () => {
    // Rounding never crosses the threshold: a reading that rounds to 1000 m
    // renders as km — a four-digit metre value would sit on the boundary
    // the formatter otherwise switches at.
    expect(formatDistance(994)).toBe('990 m away');
    expect(formatDistance(995)).toBe('1.0 km away');
    expect(formatDistance(999.5)).toBe('1.0 km away');
  });

  it('switches to kilometres with 1 decimal at 1 km and above', () => {
    expect(formatDistance(1000)).toBe('1.0 km away');
    expect(formatDistance(2400)).toBe('2.4 km away');
    expect(formatDistance(2449)).toBe('2.4 km away');
  });
});
