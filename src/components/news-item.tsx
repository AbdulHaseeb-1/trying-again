import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ImpactBadge, toneColor } from '@/components/market-ui';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { NewsItem } from '@/data/market';
import { useTheme } from '@/hooks/use-theme';

function parseAsset(assetStr: string) {
  const parts = assetStr.trim().split(/\s+/);
  const symbol = parts[0] ?? assetStr;
  const direction = parts[1] ?? '';
  let tone: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (direction === '↑') tone = 'positive';
  else if (direction === '↓') tone = 'negative';
  return { symbol, direction, tone };
}

export function NewsCard({
  item,
  onPress,
  onLongPress,
  variant = 'feed',
  isLast = false,
}: {
  item: NewsItem;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: 'feed' | 'compact';
  isLast?: boolean;
}) {
  const theme = useTheme();
  const categoryColor = toneColor(theme, item.tone);
  const isFeed = variant === 'feed';

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${item.category} news: ${item.headline}`}
      accessibilityHint="Tap to open story actions and AI analysis"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={[
        isFeed ? styles.feedCard : styles.compactRow,
        isFeed && { backgroundColor: theme.card, borderColor: theme.border },
        !isFeed && !isLast && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}>
      {/* Top Meta: Category + Impact + Time */}
      <View style={styles.metaRow}>
        <View style={styles.metaLeft}>
          <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}18` }]}>
            <ThemedText style={[styles.categoryText, { color: categoryColor }]}>
              {item.category}
            </ThemedText>
          </View>
          <ImpactBadge impact={item.impact} tone={item.tone} />
        </View>

        <View style={styles.metaRight}>
          <View style={styles.timeWrap}>
            <AppIcon name="clock" size={11} color={theme.textMuted} />
            <ThemedText type="small" themeColor="textMuted" style={styles.timeText}>
              {item.time}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Main Headline */}
      <ThemedText
        style={[styles.headline, isFeed ? styles.headlineFeed : styles.headlineCompact]}
        numberOfLines={isFeed ? 3 : 2}>
        {item.headline}
      </ThemedText>

      {/* Footer: Asset Tags & Action Trigger */}
      <View style={styles.footerRow}>
        <View style={styles.assetList}>
          {item.assets.map((asset) => {
            const { symbol, direction, tone } = parseAsset(asset);
            const tagColor =
              tone === 'positive'
                ? theme.positive
                : tone === 'negative'
                  ? theme.negative
                  : theme.textSecondary;
            return (
              <View key={asset} style={[styles.assetChip, { backgroundColor: `${tagColor}14` }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.assetSymbol}>
                  {symbol}
                </ThemedText>
                {direction ? (
                  <ThemedText style={[styles.assetArrow, { color: tagColor }]}>
                    {direction}
                  </ThemedText>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.actionWrap}>
          <View style={[styles.aiPill, { backgroundColor: `${theme.primary}16` }]}>
            <AppIcon name="sparkles" size={11} color={theme.primary} />
            <ThemedText style={[styles.aiPillText, { color: theme.primary }]}>
              AI Readout
            </ThemedText>
          </View>
        </View>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  feedCard: {
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two + 2,
    marginBottom: Spacing.three,
  },
  compactRow: {
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  headline: {
    color: '#F5F5F4',
    letterSpacing: -0.2,
  },
  headlineFeed: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  headlineCompact: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: 2,
  },
  assetList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  assetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: Radius.sm,
  },
  assetSymbol: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  assetArrow: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  actionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: Radius.full,
  },
  aiPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
