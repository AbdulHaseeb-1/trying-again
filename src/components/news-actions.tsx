import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { AppIcon } from '@/components/app-icon';
import { useAgentPanel } from '@/components/agent-panel';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { NewsItem } from '@/data/market';
import { useTheme } from '@/hooks/use-theme';

export function NewsActionSheet({ story, onClose }: { story: NewsItem | null; onClose: () => void }) {
  const theme = useTheme();
  const { analyzeNews } = useAgentPanel();

  const analyze = () => {
    if (!story) return;
    const selectedStory = story;
    onClose();
    requestAnimationFrame(() => analyzeNews(selectedStory));
  };

  return (
    <BottomSheet visible={story !== null} title="Story actions" onClose={onClose}>
      {story ? (
        <View style={styles.content}>
          <View style={[styles.preview, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
            <View style={styles.meta}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>{story.category}</ThemedText>
              <ThemedText type="small" themeColor="textMuted">{story.time} · {story.impact}</ThemedText>
            </View>
            <ThemedText style={styles.headline}>{story.headline}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{story.assets.join('  ·  ')}</ThemedText>
          </View>
          <Tap accessibilityRole="button" accessibilityLabel="Analyze story with AI" onPress={analyze} haptic="success" style={[styles.action, { backgroundColor: theme.primary }]}>
            <AppIcon name="sparkles" size={18} color={theme.background} />
            <ThemedText type="smallBold" style={{ color: theme.background }}>Analyze with AI</ThemedText>
          </Tap>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three },
  preview: { gap: Spacing.two, padding: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headline: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  action: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, borderRadius: Radius.md },
});
