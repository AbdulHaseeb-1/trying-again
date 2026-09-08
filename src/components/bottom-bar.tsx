import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = SymbolViewProps['name'];

function tabMeta(routeName: string): { label: string; icon: IconName; selectedIcon: IconName } {
  switch (routeName) {
    case 'index':
      return {
        label: 'Home',
        icon: { ios: 'house', android: 'home', web: 'house' },
        selectedIcon: { ios: 'house.fill', android: 'home_filled', web: 'house.fill' },
      };
    case 'explore':
      return {
        label: 'Explore',
        icon: { ios: 'magnifyingglass', android: 'search', web: 'magnifyingglass' },
        selectedIcon: { ios: 'magnifyingglass', android: 'search', web: 'magnifyingglass' },
      };
    default:
      return {
        label: routeName,
        icon: { ios: 'circle', android: 'circle', web: 'circle' },
        selectedIcon: { ios: 'circle.fill', android: 'circle', web: 'circle.fill' },
      };
  }
}

/**
 * Clean cross-platform bottom bar. Wired as `tabBar={(props) => <BottomBar {...props} />}`.
 * Reads colors from the app theme — no hard-coded values.
 */
export function BottomBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, Spacing.two),
        },
      ]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const meta = tabMeta(route.name);
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : typeof options.title === 'string'
              ? options.title
              : meta.label;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
            <View
              style={[
                styles.pill,
                { backgroundColor: isFocused ? theme.surface : 'transparent' },
              ]}>
              <SymbolView
                name={isFocused ? meta.selectedIcon : meta.icon}
                size={22}
                tintColor={isFocused ? theme.tabIconSelected : theme.tabIconDefault}
              />
            </View>
            <ThemedText
              type="small"
              themeColor={isFocused ? 'text' : 'textSecondary'}
              style={[styles.label, isFocused && styles.labelFocused]}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.one,
    borderRadius: Radius.lg,
  },
  pressed: {
    opacity: 0.7,
  },
  pill: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
  labelFocused: {
    fontWeight: '700',
  },
});
