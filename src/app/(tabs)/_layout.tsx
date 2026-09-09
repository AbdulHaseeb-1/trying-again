import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { BottomBar } from '@/components/bottom-bar';
import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const { width } = useWindowDimensions();

  return (
    <Tabs
      tabBar={(props) => <BottomBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        transitionSpec: { animation: 'timing', config: { duration: 250 } },
        sceneStyle: { backgroundColor: Colors.dark.background },
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.4, 1, 0.4] }),
            transform: [
              {
                translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-width, 0, width] }),
              },
            ],
          },
        }),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Pulse' }} />
      <Tabs.Screen name="news" options={{ title: 'News' }} />
      <Tabs.Screen name="markets" options={{ title: 'Markets' }} />
      <Tabs.Screen name="derivatives" options={{ title: 'Derivatives' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
    </Tabs>
  );
}
