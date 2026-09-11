import { type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { IconButton, InlineNotice } from '@/agent/ui/primitives';
import { AgentLayout, AgentType, hairline } from '@/agent/ui/tokens';

/**
 * The shell every AI settings screen sits in.
 *
 * A back affordance, a title, and one scroll container with the application's
 * content width — written once so seven screens cannot disagree about padding,
 * about where the back button lives, or about what a loading state looks like.
 */
export function SettingsScreen({
  title,
  subtitle,
  loading,
  error,
  onRetry,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.bar, { borderBottomColor: theme.border }]}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <View style={styles.barCopy}>
          <ThemedText style={[AgentType.title, { color: theme.text }]} numberOfLines={1}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, Spacing.six) + Spacing.six },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={theme.textMuted}
            />
          ) : undefined
        }>
        {error ? (
          <InlineNotice
            icon="warning"
            tone="danger"
            title={error}
            actionLabel={onRetry ? 'Retry' : undefined}
            onAction={onRetry}
          />
        ) : null}

        {loading ? (
          <View style={styles.loading}>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} style={{ height: 52 }} />
            ))}
          </View>
        ) : (
          children
        )}
      </ScrollView>
    </View>
  );
}

/** The one-line explainer that opens several of these screens. */
export function SettingsIntro({ icon, text }: { icon: Parameters<typeof AppIcon>[0]['name']; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.intro}>
      <AppIcon name={icon} size={15} color={theme.textMuted} />
      <ThemedText type="small" themeColor="textMuted" style={styles.introText}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: AgentLayout.toolbarHeight,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: hairline,
  },
  barCopy: { flex: 1, gap: 1 },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.six,
  },
  loading: { gap: Spacing.three },
  intro: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four },
  introText: { flex: 1, lineHeight: 18 },
});
