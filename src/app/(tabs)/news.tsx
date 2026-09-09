import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { AppIcon } from '@/components/app-icon';
import { AppHeader, FilterChips, ImpactBadge, SectionHeader, toneColor } from '@/components/market-ui';
import { NewsActionSheet } from '@/components/news-actions';
import { NewsCard } from '@/components/news-item';
import { Skeleton } from '@/components/skeleton';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { economicEvents, newsItems, type NewsItem } from '@/data/market';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const filters = ['All', 'Macro', 'Crypto', 'Gold', 'Fed', 'Stocks'];

export default function NewsScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [reminders, setReminders] = useState<string[]>([]);

  const items = useMemo(
    () => newsItems.filter((item) => filter === 'All' || item.category.toLowerCase() === filter.toLowerCase()),
    [filter],
  );
  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 550);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <AppHeader title="News" onSearch={() => setSheetOpen(true)} onFilter={() => setSheetOpen(true)} />
            <FilterChips items={filters} value={filter} onChange={setFilter} />

            <SectionHeader title="Upcoming events" />
            <View style={[styles.eventList, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              {economicEvents.map((event, index) => {
                const reminded = reminders.includes(event.title);
                return (
                  <View
                    key={event.title}
                    style={[
                      styles.eventRow,
                      index !== economicEvents.length - 1 && {
                        borderBottomColor: theme.border,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      },
                    ]}>
                    <View style={[styles.country, { backgroundColor: `${toneColor(theme, event.tone)}1C` }]}>
                      <ThemedText style={[styles.countryText, { color: toneColor(theme, event.tone) }]}>
                        {event.country}
                      </ThemedText>
                    </View>
                    <View style={styles.eventCopy}>
                      <View style={styles.eventMeta}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {event.time}
                        </ThemedText>
                        <ImpactBadge impact={event.impact} tone={event.tone} />
                      </View>
                      <ThemedText style={styles.eventName}>{event.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Previous {event.previous}  ·  Forecast {event.forecast}
                      </ThemedText>
                    </View>
                    <Tap
                      accessibilityRole="button"
                      accessibilityLabel={`Set reminder for ${event.title}`}
                      onPress={() =>
                        setReminders((current) =>
                          reminded ? current.filter((title) => title !== event.title) : [...current, event.title],
                        )
                      }
                      haptic="success"
                      style={styles.eventBell}>
                      <AppIcon name="bell" size={18} color={reminded ? theme.positive : theme.textMuted} />
                    </Tap>
                  </View>
                );
              })}
            </View>

            <View style={styles.feedHeaderRow}>
              <SectionHeader title="Live feed" />
              <View style={[styles.storyCountBadge, { backgroundColor: theme.surfaceVariant }]}>
                <ThemedText type="small" themeColor="textMuted" style={styles.storyCountText}>
                  {items.length} {items.length === 1 ? 'story' : 'stories'}
                </ThemedText>
              </View>
            </View>
            {refreshing ? <NewsSkeleton /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <NewsCard
            item={item}
            variant="feed"
            onPress={() => setSelectedNews(item)}
            onLongPress={() => setSelectedNews(item)}
          />
        )}
        ListEmptyComponent={
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <AppIcon name="news" size={28} color={theme.textMuted} />
            <ThemedText type="smallBold" style={styles.emptyTitle}>
              No stories found
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.emptySub}>
              No live updates currently in the {filter} category.
            </ThemedText>
          </View>
        }
      />
      <BottomSheet visible={sheetOpen} title="News filters" onClose={() => setSheetOpen(false)}>
        <View style={styles.sheetContent}>
          <ThemedText type="small" themeColor="textSecondary">
            Choose a source view for the live feed.
          </ThemedText>
          {['All sources', 'Macro only', 'Crypto only'].map((option) => (
            <Tap
              key={option}
              accessibilityRole="button"
              onPress={() => setSheetOpen(false)}
              style={[styles.sheetChoice, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">{option}</ThemedText>
              <AppIcon name="chevron" color={theme.textMuted} />
            </Tap>
          ))}
        </View>
      </BottomSheet>
      <NewsActionSheet story={selectedNews} onClose={() => setSelectedNews(null)} />
    </View>
  );
}

function NewsSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.skeletonCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.skeletonMeta}>
        <Skeleton style={{ height: 16, width: 60, borderRadius: Radius.full }} />
        <Skeleton style={{ height: 16, width: 50, borderRadius: Radius.full }} />
      </View>
      <Skeleton style={{ height: 18, width: '92%', borderRadius: 4 }} />
      <Skeleton style={{ height: 18, width: '70%', borderRadius: 4 }} />
      <View style={styles.skeletonFooter}>
        <Skeleton style={{ height: 18, width: 64, borderRadius: Radius.sm }} />
        <Skeleton style={{ height: 18, width: 52, borderRadius: Radius.sm }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.eight },
  headerContent: { gap: Spacing.three, paddingBottom: Spacing.two },
  eventList: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, paddingHorizontal: Spacing.four },
  eventRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  country: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  countryText: { fontSize: 11, fontWeight: '800' },
  eventCopy: { flex: 1, gap: 3 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventName: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  eventBell: { padding: Spacing.two },
  feedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.one,
  },
  storyCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  storyCountText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  emptyCard: {
    paddingVertical: Spacing.seven,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: Spacing.four,
  },
  emptyTitle: {
    fontSize: 14,
  },
  emptySub: {
    fontSize: 12,
  },
  skeletonCard: {
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two + 2,
    marginVertical: Spacing.two,
  },
  skeletonMeta: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  skeletonFooter: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 2,
  },
  sheetContent: { gap: Spacing.three },
  sheetChoice: {
    minHeight: 46,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
});
