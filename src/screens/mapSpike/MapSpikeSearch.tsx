/**
 * SPIKE 15.1 — floating search bar + result list for the map spike.
 * Purely presentational: state (query, results) lives in the screen so
 * the debounce effect stays there. Nominatim-backed — see geocoding.ts.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MapPin, Search } from 'lucide-react-native';

import { colors, radius, spacing, shadow, typography } from '../../theme';
import type { GeoPlace } from './geocoding';

interface Props {
  query: string;
  searching: boolean;
  results: GeoPlace[];
  onQueryChange: (q: string) => void;
  onSelect: (place: GeoPlace) => void;
}

export function MapSpikeSearch({ query, searching, results, onQueryChange, onSelect }: Props) {
  return (
    <View>
      <View style={styles.bar}>
        <Search size={20} color={colors.textMuted} strokeWidth={2} />
        <TextInput
          style={styles.input}
          placeholder="Search for location"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onQueryChange}
          returnKeyType="search"
        />
        {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
      {results.length > 0 ? (
        <View style={styles.results}>
          {results.map((place, i) => (
            <Pressable
              key={`${place.latitude},${place.longitude},${i}`}
              accessibilityRole="button"
              style={styles.row}
              onPress={() => onSelect(place)}>
              <MapPin size={16} color={colors.textMuted} strokeWidth={2} />
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {place.name}
                </Text>
                <Text style={styles.rowFull} numberOfLines={1}>
                  {place.full}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    height: 48,
    ...shadow.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textStrong,
  },
  results: {
    marginTop: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    paddingVertical: spacing.s1,
    ...shadow.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textStrong,
  },
  rowFull: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
