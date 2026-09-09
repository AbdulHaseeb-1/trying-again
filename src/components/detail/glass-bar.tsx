import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import { useTheme } from '@/hooks/use-theme';

/**
 * A translucent navigation bar.
 *
 * `GlassView` renders the real liquid-glass material on iOS 26 and silently
 * degrades to a plain transparent `View` everywhere else — which would leave
 * the bar see-through on Android and the web. So off iOS 26 we paint the
 * near-opaque fill that UIBlurEffect approximates anyway.
 */
export function GlassBar({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  const liquid = isLiquidGlassAvailable();

  if (liquid) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="dark" style={[styles.bar, style]}>
        {children}
      </GlassView>
    );
  }

  return <View style={[styles.bar, { backgroundColor: theme.barFill }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: { overflow: 'hidden' },
});
