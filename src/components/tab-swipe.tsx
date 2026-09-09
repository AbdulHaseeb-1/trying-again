import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const TAB_ORDER = ['index', 'calendar', 'markets', 'derivatives', 'alerts'] as const;

const TAB_PATHS: Record<(typeof TAB_ORDER)[number], string> = {
  index: '/',
  calendar: '/calendar',
  markets: '/markets',
  derivatives: '/derivatives',
  alerts: '/alerts',
};

export function getTabIndex(pathname: string | null): number {
  if (!pathname || pathname === '/') return 0;
  const segment = pathname.split('/').filter(Boolean)[0] ?? '';
  return TAB_ORDER.indexOf(segment as (typeof TAB_ORDER)[number]);
}

/**
 * Drag-following horizontal navigation between bottom tabs.
 * The page tracks the finger; release past ~22% width (or a fast flick)
 * slides the old page off while the next tab slides in from the same side.
 * Short of that, the page springs back. Vertical scrolling, horizontal
 * chip/ticker scrolling, and alert row swipes are left alone.
 */
export function TabSwipe({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const pathname = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(0);

  const index = getTabIndex(pathname);
  // Anything that is not a tab is a pushed detail route: swiping right goes back.
  const isDetail = index < 0;
  const canGoNext = !isDetail && index >= 0 && index < TAB_ORDER.length - 1;
  const canGoPrev = isDetail || index > 0;

  // Worklets run on the UI thread, so gesture state lives in SharedValues.
  const canNextSV = useSharedValue(canGoNext);
  const canPrevSV = useSharedValue(canGoPrev);
  const widthSV = useSharedValue(width);
  useEffect(() => {
    canNextSV.value = canGoNext;
    canPrevSV.value = canGoPrev;
    widthSV.value = width;
  }, [canGoNext, canGoPrev, width, canNextSV, canPrevSV, widthSV]);

  const pendingNav = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef((dir: 1 | -1) => {});
  commitRef.current = (dir) => {
    if (isDetail && dir === -1) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return;
    }
    const target = TAB_ORDER[index + dir];
    if (target) router.navigate(TAB_PATHS[target] as never);
  };

  useEffect(
    () => () => {
      if (pendingNav.current) clearTimeout(pendingNav.current);
    },
    [],
  );

  const schedule = useCallback((dir: 1 | -1) => {
    if (pendingNav.current) clearTimeout(pendingNav.current);
    // Brief overlap: old page slides off while the incoming tab slides in.
    pendingNav.current = setTimeout(() => {
      pendingNav.current = null;
      commitRef.current(dir);
    }, 90);
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-32, 32])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          const blocked = (e.translationX < 0 && !canNextSV.value) || (e.translationX > 0 && !canPrevSV.value);
          translateX.value = e.translationX * (blocked ? 0.08 : 0.9);
        })
        .onEnd((e) => {
          const signed = e.translationX !== 0 ? e.translationX : e.velocityX;
          const dir: 1 | -1 = signed < 0 ? 1 : -1;
          const allowed = dir === 1 ? canNextSV.value : canPrevSV.value;
          const done = allowed && (Math.abs(e.translationX) > widthSV.value * 0.22 || Math.abs(e.velocityX) > 700);
          if (done) {
            translateX.value = withTiming(-dir * widthSV.value, { duration: 200 });
            runOnJS(schedule)(dir);
          } else {
            translateX.value = withSpring(0, { damping: 24, stiffness: 300 });
          }
        }),
    [canNextSV, canPrevSV, widthSV, translateX, schedule],
  );

  // Hidden screens reset so swiping back always starts from a clean page.
  useFocusEffect(
    useCallback(
      () => () => {
        if (pendingNav.current) {
          clearTimeout(pendingNav.current);
          pendingNav.current = null;
        }
        translateX.value = 0;
      },
      [translateX],
    ),
  );

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}
