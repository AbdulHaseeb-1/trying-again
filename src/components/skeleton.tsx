import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Skeleton({ style }: { style: ViewStyle }) {
  const theme = useTheme();
  const opacity = useSharedValue(0.35);
  useEffect(() => { opacity.value = withRepeat(withTiming(0.8, { duration: 800 }), -1, true); }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.base, { backgroundColor: theme.surfaceVariant }, animated, style]} />;
}

const styles = StyleSheet.create({ base: { borderRadius: Radius.sm } });
