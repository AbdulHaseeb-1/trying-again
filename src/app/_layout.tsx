import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AgentProvider } from '@/components/agent-panel';
import { AppThemeProvider } from '@/components/theme-provider';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

function HideSplash() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.dark.background }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <AgentProvider>
            <HideSplash />
            <SafeAreaView style={{ flex: 1, backgroundColor: Colors.dark.background }} edges={['top', 'left', 'right']}>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.dark.background } }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="asset/[symbol]" options={{ animation: 'slide_from_right' }} />
              </Stack>
            </SafeAreaView>
          </AgentProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
