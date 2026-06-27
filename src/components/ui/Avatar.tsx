/**
 * Avatar — customer / technician identity. Shows an image, or initials on a
 * deterministic tinted background derived from the name.
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * size: sm | md | lg | xl
 */
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { palette, radius, weight } from '../../theme';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export type AvatarProps = {
  name?: string;
  /** Image URI. When omitted, initials are shown on a name-derived tint. */
  uri?: string | null;
  size?: Size;
  style?: StyleProp<ViewStyle>;
};

const dims: Record<Size, number> = { sm: 28, md: 40, lg: 48, xl: 64 };

// Deterministic tint pairs [background, foreground], matching the web DS.
const tints: ReadonlyArray<readonly [string, string]> = [
  [palette.blue100, palette.blue700],
  [palette.green100, palette.green700],
  [palette.amber100, palette.amber700],
  [palette.red100, palette.red700],
  [palette.gray200, palette.gray700],
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function Avatar({ name = '', uri = null, size = 'md', style }: AvatarProps) {
  const dim = dims[size];
  const [bg, fg] = tints[hashName(name) % tints.length];
  const initials = initialsOf(name);

  return (
    <View
      style={[
        styles.base,
        {
          width: dim,
          height: dim,
          borderRadius: radius.pill,
          backgroundColor: uri ? palette.gray100 : bg,
        },
        style,
      ]}>
      {uri ? (
        <Image
          source={{ uri }}
          accessibilityLabel={name}
          style={styles.image}
        />
      ) : (
        <Text
          style={{
            color: fg,
            fontSize: Math.round(dim * 0.38),
            fontWeight: weight.semibold,
          }}>
          {initials || '?'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
