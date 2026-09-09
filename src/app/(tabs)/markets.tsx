import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppIcon } from '@/components/app-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { AppHeader, FilterChips, MarketRow } from '@/components/market-ui';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { marketAssets } from '@/data/market';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const filters = ['All', 'Crypto', 'Indices', 'Commodities', 'FX'];

export default function MarketsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [watched, setWatched] = useState(['BTC', 'ETH', 'Gold']);

  const assets = useMemo(() => marketAssets.filter((asset) => {
    const categoryMatch = filter === 'All' || asset.category === filter;
    const searchMatch = `${asset.symbol} ${asset.name}`.toLowerCase().includes(query.toLowerCase());
    return categoryMatch && searchMatch;
  }), [filter, query]);
  const openAsset = (symbol: string) => router.push({ pathname: '/asset/[symbol]', params: { symbol } });

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <FlatList
        data={assets}
        keyExtractor={(asset) => asset.symbol}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View style={styles.headerContent}><AppHeader title="Markets" onSearch={() => setSearchOpen(true)} /><FilterChips items={filters} value={filter} onChange={setFilter} /><View style={styles.listHeading}><ThemedText type="small" themeColor="textSecondary">{assets.length} instruments</ThemedText><ThemedText type="small" themeColor="textSecondary">Price · 24H</ThemedText></View></View>}
        renderItem={({ item }) => <MarketRow asset={item} onPress={() => openAsset(item.symbol)} onWatch={() => setWatched((current) => current.includes(item.symbol) ? current.filter((symbol) => symbol !== item.symbol) : [...current, item.symbol])} />}
        ListEmptyComponent={<View style={styles.empty}><ThemedText type="small" themeColor="textSecondary">No markets match that search.</ThemedText></View>}
      />
      <BottomSheet visible={searchOpen} title="Search markets" onClose={() => setSearchOpen(false)}>
        <View style={styles.sheetContent}>
          <View style={[styles.inputWrap, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
            <AppIcon name="search" size={18} color={theme.textMuted} />
            <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="BTC, Gold, Nasdaq…" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
          </View>
          {watched.length ? <ThemedText type="small" themeColor="textSecondary">Watching {watched.join(' · ')}</ThemedText> : <ThemedText type="small" themeColor="textSecondary">No assets in your watchlist yet.</ThemedText>}
          <Tap accessibilityRole="button" onPress={() => setSearchOpen(false)} style={[styles.doneButton, { backgroundColor: theme.primary }]}><ThemedText type="smallBold" style={{ color: theme.background }}>Done</ThemedText></Tap>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.eight },
  headerContent: { gap: Spacing.three, paddingBottom: Spacing.two },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two, paddingBottom: Spacing.one },
  empty: { paddingVertical: Spacing.seven, alignItems: 'center' },
  sheetContent: { gap: Spacing.four },
  inputWrap: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  input: { flex: 1, fontSize: 16, minHeight: 42 },
  doneButton: { minHeight: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
