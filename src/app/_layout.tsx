import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AgentWorkspaceProvider } from '@/agent';
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
          <AgentWorkspaceProvider>
            <HideSplash />
            <SafeAreaView style={{ flex: 1, backgroundColor: Colors.dark.background }} edges={['top', 'left', 'right']}>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.dark.background } }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="asset/[symbol]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="settings/ai/index" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="settings/ai/providers" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="settings/ai/provider/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="settings/ai/models" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="settings/ai/agents" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="settings/ai/search" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="settings/ai/tools" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="settings/ai/privacy" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="settings/ai/advanced" options={{ animation: 'slide_from_right' }} />
              </Stack>
            </SafeAreaView>
          </AgentWorkspaceProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
