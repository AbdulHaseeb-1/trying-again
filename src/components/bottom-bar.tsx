import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAgentPanel } from '@/agent';
import { AppIcon, type IconName } from '@/components/app-icon';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { useAnySheetOpen } from '@/components/sheet-visibility';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const tabs: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Pulse', icon: 'pulse' },
  calendar: { label: 'Calendar', icon: 'calendar' },
  markets: { label: 'Markets', icon: 'markets' },
  derivatives: { label: 'Derivatives', icon: 'derivatives' },
  alerts: { label: 'Alerts', icon: 'alerts' },
};

type TabRoute = { key: string; name: string; params?: object };
type BottomBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: { tabBarLabel?: unknown; tabBarAccessibilityLabel?: string } }>;
  navigation: {
    emit: (event: { type: 'tabPress' | 'tabLongPress'; target: string; canPreventDefault?: boolean }) => unknown;
    navigate: (name: string, params?: object) => void;
  };
};

/** Small compatibility seam around Expo Router's v57 tab-bar callback. */
export function BottomBar({ state, descriptors, navigation }: BottomBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { openAgent } = useAgentPanel();
  const anySheetOpen = useAnySheetOpen();
  const activeRoute = state.routes[state.index];
  // Detail routes are full-screen pushes with their own back affordance.
  if (activeRoute?.name.startsWith('asset/') || activeRoute?.name.startsWith('event/')) return null;
  if (anySheetOpen) return null;

  const bottom = Math.max(insets.bottom, Spacing.three);
  return (
    <>
      <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border, bottom }]}>
        {state.routes.filter((route) => tabs[route.name]).map((route) => {
          const routeIndex = state.routes.indexOf(route);
          const focused = routeIndex === state.index;
          const { options } = descriptors[route.key];
          const tab = tabs[route.name];
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : tab.label;
          return (
            <Tap
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? `${label} tab`}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }) as { defaultPrevented?: boolean };
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.tab}>
              <View style={styles.iconSlot}>
                <AppIcon name={tab.icon} size={20} color={focused ? theme.primary : theme.tabIconDefault} />
              </View>
              <ThemedText type="small" style={[styles.label, { color: focused ? theme.primary : theme.tabIconDefault }]}>{label}</ThemedText>
            </Tap>
          );
        })}
      </View>
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Open MarketPulse AI"
        onPress={() => openAgent()}
        haptic="success"
        style={[styles.agentButton, { backgroundColor: theme.primary, bottom: bottom + 64 }]}>
        <AppIcon name="sparkles" size={21} color={theme.background} />
      </Tap>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.full,
    elevation: 12,
    boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.3)',
  },
  tab: { flex: 1, alignItems: 'center', gap: 1, paddingVertical: Spacing.one, borderRadius: Radius.md },
  iconSlot: { width: 32, height: 22, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  agentButton: {
    position: 'absolute',
    right: Spacing.four,
    zIndex: 2,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    elevation: 14,
    boxShadow: '0px 6px 10px rgba(0, 0, 0, 0.32)',
  },
});
