import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * Clean app surface: safe-area aware, centered, max-width constrained.
 * Use for every tab screen so layout stays consistent.
 */
export function Screen({
  children,
  style,
  contentStyle,
  ...rest
}: ViewProps & { children: ReactNode; contentStyle?: ViewProps['style'] }) {
  return (
    <View style={[styles.root, style]} {...rest}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safe: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
});
