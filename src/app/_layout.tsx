import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { BottomBar } from '@/components/bottom-bar';
import { AppThemeProvider } from '@/components/theme-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <Tabs
        tabBar={(props) => <BottomBar {...props} />}
        screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      </Tabs>
    </AppThemeProvider>
  );
}
