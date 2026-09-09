import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';

import { Colors, type ThemeColors } from '@/constants/theme';

type ThemeContextValue = {
  colorScheme: 'dark';
  colors: ThemeColors;
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
};

export type FontScale = 0.9 | 1 | 1.1;

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [fontScale, setFontScale] = useState<FontScale>(0.9);
  const value = useMemo<ThemeContextValue>(() => {
    return {
      colorScheme: 'dark',
      colors: Colors.dark,
      fontScale,
      setFontScale,
    };
  }, [fontScale]);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style="light" />
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      colorScheme: 'dark',
      colors: Colors.dark,
      fontScale: 0.9,
      setFontScale: () => undefined,
    };
  }
  return ctx;
}
