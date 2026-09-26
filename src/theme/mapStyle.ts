/**
 * mapStyle.ts — tokenised light Google Maps style (Story 15.4).
 *
 * `customMapStyle` takes Google's own Maps Styling JSON, not RN styles, so
 * this cannot reference the theme tokens directly — the hexes below are
 * chosen to MATCH the palette in `colors.ts` (gray50 page, gray0 roads,
 * gray200 strokes, gray500/gray900 labels, blue600 primary) and must be
 * kept in sync with it by hand. Established in the validated 15-1 spike:
 * Google otherwise follows the OS dark mode and the app wants a
 * forced-light map.
 */

/** Google Maps style JSON — light theme matched to the Fenzit palette. */
export const LIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#F9FAFB' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E5E7EB' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#C9E4F4' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#EFF2F6' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#D3E8D3' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#E9EDF2' }],
  },
];
