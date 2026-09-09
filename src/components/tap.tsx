import type { ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type TapProps = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  haptic?: 'selection' | 'success' | 'none';
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Tap({ children, style, haptic = 'selection', onPress, onPressIn, onPressOut, ...props }: TapProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  return (
    <AnimatedPressable
      {...props}
      onPress={(event) => {
        onPress?.(event);
      }}
      onPressIn={(event) => {
        scale.value = withSpring(0.975, { damping: 22, stiffness: 340, mass: 0.42 });
        opacity.value = withSpring(0.9, { damping: 22, stiffness: 340, mass: 0.42 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, { damping: 18, stiffness: 290, mass: 0.48 });
        opacity.value = withSpring(1, { damping: 18, stiffness: 290, mass: 0.48 });
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}
