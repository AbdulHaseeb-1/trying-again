import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type IconName } from '@/components/app-icon';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The one layout every screen is built in.
 *
 * Before this existed in earnest, each tab reinvented the same three
 * decisions — how wide the content may get, how far it sits from the edge,
 * and how much room the floating tab bar needs — and they disagreed: two tabs
 * were centred at 560px while three sprawled to the full window, and two
 * reserved no space for the bar at all, so their last row sat underneath it.
 */
export function Screen({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.background }, style]} {...rest}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

/** Height of the floating tab bar, measured rather than guessed at each call site. */
const BAR_HEIGHT = 62;
/** The agent button floats above the bar; content must clear both. */
const AGENT_CLEARANCE = 56;

/**
 * How much room a scrolling screen must leave at the bottom.
 *
 * The tab bar and the agent button are absolutely positioned over every
 * screen, so the last row of a list is only reachable if the scroll view ends
 * above them.
 */
export function useChromeInset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, Spacing.three) + BAR_HEIGHT + AGENT_CLEARANCE;
}

export type HeaderAction = { icon: IconName; label: string; onPress: () => void; tone?: 'default' | 'primary' };

/**
 * The title block every tab opens with: name, one line of live status, and
 * icon actions. Uniform because "which tab am I on" should never depend on
 * which developer wrote the screen.
 */
export function ScreenHeader({
  title,
  status,
  actions = [],
  trailing,
}: {
  title: string;
  /** A short freshness or count line — kept to one line, never wrapped. */
  status?: ReactNode;
  actions?: HeaderAction[];
  /** A control that needs more than an icon, e.g. the asset selector. */
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerTitle}>
        <ThemedText style={styles.title} numberOfLines={1}>
          {title}
        </ThemedText>
        {status ? <View style={styles.status}>{status}</View> : null}
      </View>
      <View style={styles.headerActions}>
        {actions.map((action) => (
          <Tap
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            haptic="none"
            style={[styles.actionButton, { borderColor: theme.border }]}>
            <AppIcon
              name={action.icon}
              size={16}
              color={action.tone === 'primary' ? theme.primary : theme.textSecondary}
            />
          </Tap>
        ))}
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 34,
  },
  headerTitle: { flex: 1, gap: 2 },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.6 },
  status: { flexDirection: 'row', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
