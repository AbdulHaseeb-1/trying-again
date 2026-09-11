import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AgentSummary } from '@/agent/protocol';
import { IconButton } from '@/agent/ui/primitives';
import { AgentLayout, AgentType, hairline } from '@/agent/ui/tokens';

/**
 * The panel's toolbar.
 *
 * A navigation bar's worth of restraint: a title, a status line that is one
 * line and never wraps, and three controls. Everything else — rename, delete,
 * pin, debug, agent switching — is one tap deeper, in the overflow menu, on the
 * principle that a control used once a week should not cost space every second.
 */
export function PanelHeader({
  agent,
  status,
  live,
  onNew,
  onHistory,
  onMore,
  onClose,
  closeIcon = 'close',
  closeLabel = 'Close assistant',
}: {
  agent: AgentSummary | null;
  status: string | null;
  live: boolean;
  onNew: () => void;
  onHistory: () => void;
  onMore: () => void;
  onClose: () => void;
  closeIcon?: 'close' | 'collapse';
  closeLabel?: string;
}) {
  const theme = useTheme();

  const subtitle = status ?? (agent?.model ? `${agent.model.modelId}` : 'Not configured');

  return (
    <View style={[styles.root, { borderBottomColor: theme.border }]}>
      <View style={styles.identity}>
        <View style={styles.titleRow}>
          <ThemedText style={[AgentType.title, { color: theme.text }]} numberOfLines={1}>
            {agent?.name ?? 'Assistant'}
          </ThemedText>
          {live ? <View style={[styles.dot, { backgroundColor: theme.positive }]} /> : null}
        </View>
        <View style={styles.statusRow}>
          {agent?.model ? (
            <AppIcon name="zap" size={10} color={theme.textMuted} />
          ) : (
            <AppIcon name="warning" size={10} color={theme.warning} />
          )}
          <ThemedText
            type="small"
            themeColor="textMuted"
            numberOfLines={1}
            style={styles.statusText}>
            {subtitle}
          </ThemedText>
        </View>
      </View>

      <View style={styles.actions}>
        <IconButton icon="plus" label="New conversation" onPress={onNew} />
        <IconButton icon="history" label="Conversation history" onPress={onHistory} />
        <IconButton icon="more" label="More options" onPress={onMore} />
        <IconButton icon={closeIcon} label={closeLabel} onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: AgentLayout.toolbarHeight,
    paddingLeft: Spacing.five,
    paddingRight: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: hairline,
  },
  identity: { flex: 1, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { flex: 1, fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
