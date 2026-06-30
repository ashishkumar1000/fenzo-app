/**
 * BrandMark — the Fenzit app mark: the real brand glyph
 * (`assets/branding/logo.png`, the blue "F" used on the splash screen) on a
 * rounded light card. The glyph itself is blue, so the tile must be light
 * (white/blue-tinted) — a solid primary-blue tile would hide it. Sized via
 * the `size` prop; defaults to 64.
 */
import { Image, StyleSheet, View } from 'react-native';
import { colors, radius, shadow } from '../../../theme';

type Props = {
  size?: number;
};

export function BrandMark({ size = 64 }: Props) {
  return (
    <View
      style={[
        styles.tile,
        shadow.sm,
        { width: size, height: size, borderRadius: radius.xl },
      ]}>
      <Image
        source={require('../../../assets/branding/logo.png')}
        style={{ width: size * 0.6, height: size * 0.6 }}
        resizeMode="contain"
        accessibilityLabel="Fenzit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
