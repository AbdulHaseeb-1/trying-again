import { View, type ViewProps } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Legacy aliases from the Expo template — mapped to the new tokens. */
const LEGACY_ALIAS: Record<string, ThemeColor> = {
  backgroundElement: 'surface',
  backgroundSelected: 'surfaceVariant',
};

export type ThemedViewProps = ViewProps & {
  /** Surface token. Defaults to 'background'. */
  type?: ThemeColor | 'backgroundElement' | 'backgroundSelected';
};

export function ThemedView({ style, type = 'background', ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  const token = (LEGACY_ALIAS[type] ?? type) as ThemeColor;

  return <View style={[{ backgroundColor: theme[token] }, style]} {...otherProps} />;
}
