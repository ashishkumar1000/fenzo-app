/**
 * TabBar — custom bottom-tab bar rendered via `tabBar` on the Bottom Tab
 * Navigator, styled with Fenzit tokens (active = primary blue, inactive =
 * muted gray). Built from core RN + Lucide; no extra dependency.
 *
 * Using a custom `tabBar` (rather than the default + tabBarIcon/tabBarLabel
 * options) keeps every visual value sourced from `@theme`, per the design
 * system's "never hard-code" rule, and matches the existing Button/IconButton
 * press-feedback conventions used elsewhere in the app.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ClipboardList,
  Home as HomeIcon,
  MoreHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { colors, fontSize, spacing, weight } from '../theme';

const ICONS: Record<string, LucideIcon> = {
  Home: HomeIcon,
  Jobs: ClipboardList,
  Customers: Users,
  More: MoreHorizontal,
};

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const Icon = ICONS[route.name] ?? HomeIcon;
          const label =
            typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const color = focused ? colors.primary : colors.textMuted;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={onPress}
              style={styles.tab}>
              <Icon size={24} color={color} strokeWidth={focused ? 2.25 : 1.75} />
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  row: {
    flexDirection: 'row',
    paddingTop: spacing.s2,
    paddingBottom: spacing.s1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.s1,
  },
  label: {
    fontSize: fontSize['2xs'],
    fontWeight: weight.medium,
  },
});
