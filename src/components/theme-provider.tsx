import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider as NavigationThemeProvider } from 'expo-router';

import { Colors, type ColorScheme, type ThemeColors } from '@/constants/theme';
import { useColorScheme as useAdaptiveColorScheme } from '@/hooks/use-color-scheme';

export type ThemeMode = 'system' | ColorScheme;

type ThemeContextValue = {
  /** Requested mode. 'system' follows the OS. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  /** Resolved scheme after applying 'system'. Always 'light' | 'dark'. */
  colorScheme: ColorScheme;
  colors: ThemeColors;
  navigationTheme: Theme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveScheme(mode: ThemeMode, system: ColorScheme | null | undefined): ColorScheme {
  if (mode !== 'system') return mode;
  return system === 'dark' ? 'dark' : 'light';
}

function buildNavigationTheme(scheme: ColorScheme): Theme {
  const colors = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
  };
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  // useAdaptiveColorScheme handles web SSR hydration; falls back to RN on native.
  const systemScheme = useAdaptiveColorScheme() as ColorScheme | null | undefined;

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const toggle = useCallback(() => {
    setModeState((prev) => {
      const resolved = resolveScheme(prev, systemScheme);
      return resolved === 'dark' ? 'light' : 'dark';
    });
  }, [systemScheme]);

  const value = useMemo<ThemeContextValue>(() => {
    const colorScheme = resolveScheme(mode, systemScheme);
    return {
      mode,
      setMode,
      toggle,
      colorScheme,
      colors: Colors[colorScheme],
      navigationTheme: buildNavigationTheme(colorScheme),
    };
  }, [mode, systemScheme, setMode, toggle]);

  return (
    <ThemeContext.Provider value={value}>
      <NavigationThemeProvider value={value.navigationTheme}>
        <StatusBar style={value.colorScheme === 'dark' ? 'light' : 'dark'} />
        {children}
      </NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

/** Prefer `useAppTheme()` for mode switching, `useTheme()` for just colors. */
export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback outside provider (e.g. tests): resolve from system scheme.
    const system = useSystemColorScheme() as ColorScheme | null | undefined;
    const colorScheme: ColorScheme = system === 'dark' ? 'dark' : 'light';
    return {
      mode: 'system',
      setMode: () => {},
      toggle: () => {},
      colorScheme,
      colors: Colors[colorScheme],
      navigationTheme: buildNavigationTheme(colorScheme),
    };
  }
  return ctx;
}
