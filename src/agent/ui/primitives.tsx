import { useEffect, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon, type IconName } from '@/components/app-icon';
import { trackSheetOpen } from '@/components/sheet-visibility';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AgentLayout, AgentMotion, AgentType, hairline, softShadow } from '@/agent/ui/tokens';
import { useReducedMotion } from '@/agent/ui/use-reduced-motion';

/**
 * The small set of controls the panel is built from.
 *
 * Kept here rather than inline so that spacing, hit targets and focus behaviour
 * are decided once. Every one of them clears a 44pt touch target even when it
 * draws smaller, which is the difference between a panel that feels native on a
 * phone and one that feels like a website.
 */

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'secondary',
  disabled,
  size = 18,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'secondary' | 'primary' | 'danger' | 'onPrimary';
  disabled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const color =
    tone === 'primary'
      ? theme.primary
      : tone === 'danger'
        ? theme.negative
        : tone === 'onPrimary'
          ? theme.background
          : theme.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      // The visual is 32pt; the hit area is 44pt. Both matter.
      hitSlop={(AgentLayout.minTouch - AgentLayout.iconButton) / 2}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: disabled ? 0.35 : pressed ? 0.55 : 1 },
        style,
      ]}>
      <AppIcon name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Separator({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return <View style={{ height: hairline, marginLeft: inset, backgroundColor: theme.separator }} />;
}

/**
 * A menu.
 *
 * One implementation, two presentations: anchored near its trigger when there
 * is room, and a bottom sheet when there is not. That is the behaviour iOS has
 * for a context menu on a phone versus a popover on a tablet, and it is the
 * difference between a menu that is reachable by thumb and one that is not.
 */
export function Menu({
  visible,
  onClose,
  title,
  children,
  anchor = 'bottom',
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  anchor?: 'bottom' | 'top-right';
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!visible) return;
    return trackSheetOpen();
  }, [visible]);

  if (!visible) return null;

  const sheet = anchor === 'bottom';

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(AgentMotion.enter)}
        exiting={reduceMotion ? undefined : FadeOut.duration(AgentMotion.exit)}
        style={styles.menuRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}
        />
        <Animated.View
          entering={
            reduceMotion
              ? undefined
              : sheet
                ? SlideInDown.springify().damping(26).stiffness(260).mass(0.7)
                : FadeIn.duration(AgentMotion.enter)
          }
          exiting={reduceMotion ? undefined : sheet ? SlideOutDown.duration(AgentMotion.exit) : FadeOut}
          style={[
            sheet ? styles.menuSheet : styles.menuPopover,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              paddingBottom: sheet ? Math.max(insets.bottom, Spacing.four) : Spacing.two,
              top: sheet ? undefined : Math.max(insets.top, Spacing.four) + AgentLayout.toolbarHeight,
            },
            softShadow,
          ]}>
          {sheet ? <View style={[styles.grabber, { backgroundColor: theme.borderStrong }]} /> : null}
          {title ? (
            <ThemedText type="small" themeColor="textMuted" style={styles.menuTitle}>
              {title}
            </ThemedText>
          ) : null}
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            style={styles.menuScroll}
            contentContainerStyle={styles.menuContent}>
            {children}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function MenuItem({
  icon,
  label,
  detail,
  selected,
  destructive,
  onPress,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  selected?: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: pressed ? theme.surfaceVariant : 'transparent' },
      ]}>
      {icon ? (
        <AppIcon name={icon} size={17} color={destructive ? theme.negative : theme.textSecondary} />
      ) : (
        <View style={styles.menuIconSpacer} />
      )}
      <View style={styles.menuItemCopy}>
        <ThemedText
          style={[AgentType.body, { color: destructive ? theme.negative : theme.text }]}
          numberOfLines={1}>
          {label}
        </ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {selected ? <AppIcon name="check" size={16} color={theme.primary} /> : null}
    </Pressable>
  );
}

/** Three dots that breathe. The only animation that runs for more than a second. */
export function TypingDots({ color }: { color: string }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withRepeat(withTiming(1, { duration: 900 }), -1, false);
  }, [progress, reduceMotion]);

  return (
    <View style={styles.dots} accessibilityRole="progressbar" accessibilityLabel="Thinking">
      {[0, 1, 2].map((index) => (
        <Dot key={index} index={index} color={color} progress={progress} static={reduceMotion} />
      ))}
    </View>
  );
}

function Dot({
  index,
  color,
  progress,
  static: isStatic,
}: {
  index: number;
  color: string;
  progress: { value: number };
  static: boolean;
}) {
  const animated = useAnimatedStyle(() => {
    if (isStatic) return { opacity: 0.5 };
    const phase = (progress.value + index / 3) % 1;
    // A gentle triangle wave: no scale, no bounce, just opacity.
    return { opacity: 0.25 + 0.55 * (phase < 0.5 ? phase * 2 : (1 - phase) * 2) };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: color }, animated]} />;
}

/** An inline error with one action, in the shape the panel uses everywhere. */
export function InlineNotice({
  icon,
  tone = 'neutral',
  title,
  detail,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  tone?: 'neutral' | 'warning' | 'danger';
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  const accent =
    tone === 'danger' ? theme.negative : tone === 'warning' ? theme.warning : theme.textSecondary;

  return (
    <View style={[styles.notice, { backgroundColor: theme.surface }]}>
      <AppIcon name={icon} size={16} color={accent} />
      <View style={styles.noticeCopy}>
        <ThemedText type="small" style={{ color: theme.text }}>
          {title}
        </ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textMuted">
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={10}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: AgentLayout.iconButton,
    height: AgentLayout.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  menuRoot: { flex: 1, justifyContent: 'flex-end' },
  menuSheet: {
    width: '100%',
    maxHeight: '72%',
    borderTopWidth: hairline,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.two,
  },
  menuPopover: {
    position: 'absolute',
    right: Spacing.four,
    width: 288,
    maxHeight: 420,
    borderWidth: hairline,
    borderRadius: Radius.lg,
    paddingTop: Spacing.two,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing.three,
  },
  menuTitle: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  menuScroll: { flexGrow: 0 },
  menuContent: { paddingBottom: Spacing.two },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: AgentLayout.minTouch,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  menuIconSpacer: { width: 17 },
  menuItemCopy: { flex: 1, gap: 1 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 18 },
  dot: { width: 5, height: 5, borderRadius: Radius.full },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.md,
  },
  noticeCopy: { flex: 1, gap: 2 },
});

export { Platform };
