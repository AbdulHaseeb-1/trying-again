import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchNewsItem, fetchRelatedNews } from '@/agent/client/agent-api';
import type { AgentMessageReference, NewsItem } from '@/agent/protocol';
import { InlineNotice } from '@/agent/ui/primitives';
import { AgentType } from '@/agent/ui/tokens';

/**
 * What opens when someone taps a citation.
 *
 * This is where the citation architecture pays off. A news reference carries an
 * internal id, so the sheet fetches the stored article and shows the headline,
 * publisher, time, summary, affected symbols and importance — the things that
 * let a reader judge a claim — with the original link as an option rather than
 * as the only thing on offer. A web reference has no stored body, so it shows
 * what the search provider returned and links out.
 *
 * Either way the user can always answer "where did that come from?".
 */
export function SourceSheet({
  reference,
  onClose,
}: {
  reference: AgentMessageReference | null;
  onClose: () => void;
}) {
  if (!reference) return null;
  // Keyed by the reference so opening a second source starts from a clean
  // state rather than briefly showing the previous article's body.
  return <SourceBody key={reference.id} reference={reference} onClose={onClose} />;
}

function SourceBody({
  reference,
  onClose,
}: {
  reference: AgentMessageReference;
  onClose: () => void;
}) {
  const theme = useTheme();
  const newsId = reference.type === 'news' ? (reference.entityId ?? null) : null;

  const [item, setItem] = useState<NewsItem | null>(null);
  const [related, setRelated] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(newsId !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!newsId) return;
    let active = true;
    void (async () => {
      try {
        const [article, neighbours] = await Promise.all([
          fetchNewsItem(newsId),
          fetchRelatedNews(newsId).catch(() => ({ items: [] as NewsItem[] })),
        ]);
        if (!active) return;
        setItem(article);
        setRelated(neighbours.items);
      } catch {
        if (active) setError('That article is no longer in the news store.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [newsId]);

  const url = item?.canonicalUrl ?? item?.sourceUrl ?? reference.url ?? null;
  const publishedAt = item?.publishedAt ?? reference.publishedAt ?? null;

  return (
    <BottomSheet visible title="Source" onClose={onClose}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: theme.surfaceVariant }]}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              {reference.citationIndex}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
            {item?.source ?? reference.source ?? typeLabel(reference.type)}
          </ThemedText>
          {publishedAt ? (
            <ThemedText type="small" themeColor="textMuted">
              {formatWhen(publishedAt)}
            </ThemedText>
          ) : null}
        </View>

        <ThemedText style={styles.headline}>{item?.title ?? reference.title}</ThemedText>

        {loading ? (
          <View style={styles.loading}>
            <Skeleton style={{ height: 14, width: '92%' }} />
            <Skeleton style={{ height: 14, width: '78%' }} />
            <Skeleton style={{ height: 14, width: '60%' }} />
          </View>
        ) : null}

        {error ? <InlineNotice icon="warning" tone="warning" title={error} /> : null}

        {(item?.summary ?? reference.snippet) ? (
          <ThemedText style={[AgentType.body, { color: theme.textSecondary }]}>
            {item?.summary ?? reference.snippet}
          </ThemedText>
        ) : null}

        {item ? (
          <View style={styles.meta}>
            {item.symbols.length > 0 ? (
              <MetaRow label="Symbols" value={item.symbols.join(' · ')} />
            ) : null}
            <MetaRow label="Importance" value={item.importance} />
            {item.sentiment ? <MetaRow label="Reading" value={item.sentiment} /> : null}
            <MetaRow label="Captured" value={formatWhen(item.receivedAt)} />
          </View>
        ) : null}

        {url ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open the original source"
            onPress={() => void Linking.openURL(url).catch(() => undefined)}
            style={({ pressed }) => [
              styles.openRow,
              { backgroundColor: pressed ? theme.surfaceVariant : theme.surface },
            ]}>
            <AppIcon name="link" size={16} color={theme.primary} />
            <ThemedText type="small" style={[styles.flex, { color: theme.primary }]} numberOfLines={1}>
              Open the original
            </ThemedText>
            <AppIcon name="chevron" size={14} color={theme.textMuted} />
          </Pressable>
        ) : null}

        {related.length > 0 ? (
          <View style={styles.related}>
            <ThemedText type="small" themeColor="textMuted" style={styles.relatedTitle}>
              RELATED COVERAGE
            </ThemedText>
            {related.map((entry) => (
              <View key={entry.id} style={[styles.relatedRow, { backgroundColor: theme.surface }]}>
                <ThemedText type="small" numberOfLines={2}>
                  {entry.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textMuted">
                  {entry.source} · {formatWhen(entry.publishedAt)}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <ThemedText type="small" themeColor="textMuted" style={styles.metaLabel}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.flex}>
        {value}
      </ThemedText>
    </View>
  );
}

function typeLabel(type: AgentMessageReference['type']): string {
  switch (type) {
    case 'news':
      return 'Application news';
    case 'web':
      return 'Web';
    case 'market_data':
      return 'Market data';
    case 'chart':
      return 'Chart';
    case 'application_entity':
      return 'Application';
    default:
      return 'Source';
  }
}

export function formatWhen(iso: string): string {
  const delta = Date.now() - Date.parse(iso);
  if (!Number.isFinite(delta)) return '';
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four, paddingBottom: Spacing.six },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: {
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.one,
  },
  flex: { flex: 1 },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 },
  loading: { gap: Spacing.two },
  meta: { gap: Spacing.two },
  metaRow: { flexDirection: 'row', gap: Spacing.three },
  metaLabel: { width: 88 },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
  },
  related: { gap: Spacing.two },
  relatedTitle: { letterSpacing: 0.6, fontSize: 11 },
  relatedRow: { gap: 2, padding: Spacing.three, borderRadius: Radius.md },
});
