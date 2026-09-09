import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BackHandler, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SlideInDown,
  SlideOutDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { AppIcon } from '@/components/app-icon';
import { trackSheetOpen } from '@/components/sheet-visibility';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BottomSheetProps = {
  visible: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

function SheetCard({ title, onClose, children }: Omit<BottomSheetProps, 'visible'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dragY = useSharedValue(0);
  const sheetHeight = useSharedValue(0);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const requestClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  // Downward drag on the handle/header zone dismisses the sheet. The gesture
  // lives only on the header so it never fights the content ScrollViews.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-100000, 6])
        .failOffsetX([-12, 12])
        .onUpdate((event) => {
          dragY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          const height = sheetHeight.value || 400;
          if (event.translationY > Math.max(80, height * 0.2) || event.velocityY > 800) {
            runOnJS(requestClose)();
          } else {
            dragY.value = withSpring(0, { damping: 26, stiffness: 320 });
          }
        })
        .onFinalize((_, success) => {
          if (!success) {
            dragY.value = withSpring(0, { damping: 26, stiffness: 320 });
          }
        }),
    [dragY, requestClose, sheetHeight],
  );

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(24).stiffness(200).mass(0.72)}
      exiting={SlideOutDown.duration(220)}
      onLayout={(event) => {
        sheetHeight.value = event.nativeEvent.layout.height;
      }}
      style={[
        styles.sheet,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          paddingBottom: Math.max(insets.bottom, Spacing.three),
        },
        dragStyle,
      ]}>
      <GestureDetector gesture={pan}>
        <View collapsable={false}>
          <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />
          <View style={styles.header}>
            <ThemedText type="smallBold" style={styles.title}>{title}</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
              <AppIcon name="close" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
        </View>
      </GestureDetector>
      <View style={styles.contentWrapper}>
        {children}
      </View>
    </Animated.View>
  );
}

export function BottomSheet({ visible, title, children, onClose }: BottomSheetProps) {
  const theme = useTheme();

  // The RN Modal dialog window measures unreliably on some Android devices
  // (short sheet + undimmed gap below), so Android renders the sheet as an
  // in-screen overlay inside the screen root instead. Same API either way —
  // render BottomSheet as a direct child of the screen's root flex:1 View.
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // Lets the tab bar hide while a sheet is open (an in-screen sheet on
  // Android can't paint above the navigator's floating tab bar).
  useEffect(() => {
    if (!visible) return;
    return trackSheetOpen();
  }, [visible]);

  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={[styles.backdrop, { backgroundColor: theme.overlay }]} />
        <SheetCard title={title} onClose={onClose}>{children}</SheetCard>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={[styles.backdrop, { backgroundColor: theme.overlay }]} />
        <SheetCard title={title} onClose={onClose}>{children}</SheetCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // In-screen overlay (Android): fills the screen root, above the tab bar.
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    zIndex: 60,
    elevation: 60,
  },
  // Modal window content (iOS/web): fills the dialog.
  modalOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'stretch', backgroundColor: 'transparent' },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    maxHeight: '92%',
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.four,
    minHeight: 156,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: Radius.full, marginTop: Spacing.two, marginBottom: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  title: { fontSize: 16 },
  contentWrapper: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
});
