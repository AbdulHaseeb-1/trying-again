import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AppIcon, type IconName } from '@/components/app-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { EmptyState, FilterChips } from '@/components/market-ui';
import { Screen, ScreenHeader, useChromeInset } from '@/components/screen';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { alertSeed } from '@/data/market';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const tabs = ['Active', 'Watchlist', 'History'];

export default function AlertsScreen() {
  const theme = useTheme();
  const bottomInset = useChromeInset();
  const [tab, setTab] = useState('Active');
  const [alerts, setAlerts] = useState(alertSeed);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const activeAlerts = useMemo(() => alerts.filter((alert) => tab === 'Active' ? alert.active : !alert.active), [alerts, tab]);

  const createAlert = () => {
    if (!title.trim()) { setError('Give this alert a clear title.'); return; }
    setAlerts((current) => [{ id: String(Date.now()), icon: 'bell', title: title.trim(), detail: 'Custom market condition is being watched.', time: 'Now', active: true }, ...current]);
    setTitle(''); setError(''); setCreateOpen(false); setTab('Active');
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Alerts"
          status={
            <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
              {alerts.filter((alert) => alert.active).length} active · local preview
            </ThemedText>
          }
          trailing={
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Create alert"
              onPress={() => setCreateOpen(true)}
              style={[styles.addButton, { backgroundColor: theme.primary }]}>
              <AppIcon name="plus" size={17} color={theme.background} />
              <ThemedText type="smallBold" style={{ color: theme.background }}>Create</ThemedText>
            </Tap>
          }
        />
        <FilterChips items={tabs} value={tab} onChange={setTab} accessibilityLabel="Alert list" />
        {tab === 'Watchlist' ? <EmptyState icon="watch" title="No watchlist yet" body="Star a market from the Markets tab and it will show up here." /> : activeAlerts.length ? <View style={styles.alertList}>{activeAlerts.map((alert) => <AlertRow key={alert.id} alert={alert} onDelete={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))} onMute={() => setAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, active: false } : item))} />)}</View> : <EmptyState title={tab === 'Active' ? 'No active alerts' : 'No alert history'} body={tab === 'Active' ? 'Create an alert to be notified when important market conditions occur.' : 'Triggered and muted alerts will appear here.'} action={tab === 'Active' ? 'Create alert' : undefined} onAction={() => setCreateOpen(true)} />}
      </ScrollView>
      <BottomSheet visible={createOpen} title="Create alert" onClose={() => { setCreateOpen(false); setError(''); }}>
        <View style={styles.sheetContent}><ThemedText type="small" themeColor="textSecondary">Name the market condition you want to monitor.</ThemedText><TextInput value={title} onChangeText={(value) => { setTitle(value); setError(''); }} placeholder="e.g. BTC funding extreme" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: error ? theme.negative : theme.border, backgroundColor: theme.surfaceVariant }]} />{error ? <ThemedText type="small" style={{ color: theme.negative }}>{error}</ThemedText> : null}<Tap accessibilityRole="button" onPress={createAlert} haptic="success" style={[styles.createButton, { backgroundColor: theme.primary }]}><ThemedText type="smallBold" style={{ color: theme.background }}>Create alert</ThemedText></Tap></View>
      </BottomSheet>
    </Screen>
  );
}

function AlertRow({ alert, onMute, onDelete }: { alert: typeof alertSeed[number]; onMute: () => void; onDelete: () => void }) {
  const theme = useTheme();
  const icon = alert.icon as IconName;
  return <Swipeable overshootRight={false} renderRightActions={() => <View style={styles.swipeActions}><Tap accessibilityRole="button" onPress={onMute} style={[styles.swipeButton, { backgroundColor: theme.warning }]}><ThemedText type="smallBold" style={{ color: theme.background }}>Mute</ThemedText></Tap><Tap accessibilityRole="button" onPress={onDelete} style={[styles.swipeButton, { backgroundColor: theme.negative }]}><ThemedText type="smallBold" style={{ color: theme.text }}>Delete</ThemedText></Tap></View>}><View style={[styles.alertRow, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.alertIcon}><AppIcon name={icon} color={theme.primary} /></View><View style={styles.alertCopy}><ThemedText style={styles.alertTitle}>{alert.title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{alert.detail}</ThemedText><ThemedText type="small" themeColor="textMuted">{alert.time}</ThemedText></View><AppIcon name="chevron" color={theme.textMuted} /></View></Swipeable>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.four },
  addButton: { minHeight: 32, paddingHorizontal: Spacing.three, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', gap: 4 },
  alertList: { gap: Spacing.two },
  alertRow: { minHeight: 76, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  alertIcon: { width: 34, height: 34, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  alertCopy: { flex: 1, gap: 2 },
  alertTitle: { fontSize: 15, fontWeight: '700' },
  swipeActions: { flexDirection: 'row', gap: 2, marginLeft: Spacing.two },
  swipeButton: { width: 64, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  sheetContent: { gap: Spacing.three },
  input: { minHeight: 44, paddingHorizontal: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, fontSize: 16 },
  createButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
});
