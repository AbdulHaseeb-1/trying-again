import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AgentConversation } from '@/agent/protocol';
import { Menu, MenuItem, Separator } from '@/agent/ui/primitives';
import { formatWhen } from '@/agent/ui/source-sheet';
import { AgentLayout, AgentType, hairline } from '@/agent/ui/tokens';

/**
 * Recent conversations.
 *
 * Kept to a list with a search field and a per-row menu, on purpose. The brief
 * for this panel is an assistant, not a second navigation system, so there is
 * no folder tree, no tagging and no bulk selection — a search box and pinning
 * cover what people actually do with a history this size.
 */
export function ConversationList({
  visible,
  conversations,
  loading,
  activeId,
  onClose,
  onSelect,
  onSearch,
  onRename,
  onTogglePin,
  onDelete,
}: {
  visible: boolean;
  conversations: AgentConversation[];
  loading: boolean;
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onSearch: (query: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<AgentConversation | null>(null);
  const [renaming, setRenaming] = useState<AgentConversation | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  // Debounced, because a search hits the server and a keystroke does not
  // deserve a round trip.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => onSearch(query), 220);
    return () => clearTimeout(timer);
  }, [onSearch, query, visible]);

  return (
    <>
      <Menu visible={visible && !renaming} onClose={onClose} title="Conversations">
        <View style={[styles.search, { backgroundColor: theme.surfaceVariant }]}>
          <AppIcon name="search" size={15} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search conversations"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel="Search conversations"
            returnKeyType="search"
            style={[styles.searchInput, AgentType.meta, { color: theme.text }]}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              hitSlop={10}>
              <AppIcon name="close" size={13} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loading}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} style={{ height: 18, width: `${88 - index * 12}%` }} />
            ))}
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText type="small" themeColor="textMuted">
              {query ? 'No conversations match that.' : 'No conversations yet.'}
            </ThemedText>
          </View>
        ) : (
          conversations.map((conversation, index) => (
            <View key={conversation.id}>
              {index > 0 ? <Separator inset={Spacing.four} /> : null}
              <View style={styles.row}>
                <Pressable
                  testID="conversation-row"
                  accessibilityRole="button"
                  accessibilityState={{ selected: conversation.id === activeId }}
                  accessibilityLabel={conversation.title}
                  onPress={() => {
                    onSelect(conversation.id);
                    onClose();
                  }}
                  style={styles.rowMain}>
                  {conversation.pinned ? (
                    <AppIcon name="pin" size={13} color={theme.primary} />
                  ) : null}
                  <View style={styles.rowCopy}>
                    <ThemedText
                      type="small"
                      numberOfLines={1}
                      style={{
                        color: conversation.id === activeId ? theme.primary : theme.text,
                      }}>
                      {conversation.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                      {conversation.messageCount} message
                      {conversation.messageCount === 1 ? '' : 's'} ·{' '}
                      {formatWhen(conversation.updatedAt)}
                      {conversation.context.symbol ? ` · ${conversation.context.symbol}` : ''}
                    </ThemedText>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Options for ${conversation.title}`}
                  onPress={() => setMenuFor(conversation)}
                  hitSlop={10}
                  style={styles.rowMenu}>
                  <AppIcon name="more" size={16} color={theme.textMuted} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </Menu>

      <Menu
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.title}>
        <MenuItem
          icon="edit"
          label="Rename"
          onPress={() => {
            setDraftTitle(menuFor?.title ?? '');
            setRenaming(menuFor);
            setMenuFor(null);
          }}
        />
        <MenuItem
          icon="pin"
          label={menuFor?.pinned ? 'Unpin' : 'Pin to top'}
          onPress={() => {
            if (menuFor) onTogglePin(menuFor.id, !menuFor.pinned);
            setMenuFor(null);
          }}
        />
        <MenuItem
          icon="trash"
          label="Delete"
          destructive
          onPress={() => {
            if (menuFor) onDelete(menuFor.id);
            setMenuFor(null);
          }}
        />
      </Menu>

      {/* Renaming is a detour from the list, so closing it returns there: the
          history menu is suppressed only while the rename sheet is up. */}
      <Menu visible={renaming !== null} onClose={() => setRenaming(null)} title="Rename">
        <View style={styles.renameBox}>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            autoFocus
            maxLength={120}
            accessibilityLabel="Conversation title"
            placeholder="Conversation title"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.renameInput,
              AgentType.body,
              { color: theme.text, backgroundColor: theme.surfaceVariant },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save title"
            disabled={draftTitle.trim().length === 0}
            onPress={() => {
              if (renaming && draftTitle.trim()) onRename(renaming.id, draftTitle.trim());
              setRenaming(null);
            }}
            style={({ pressed }) => [
              styles.renameSave,
              {
                backgroundColor: draftTitle.trim() ? theme.primary : theme.surfaceVariant,
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: draftTitle.trim() ? theme.background : theme.textMuted }}>
              Save
            </ThemedText>
          </Pressable>
        </View>
      </Menu>
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 36,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  searchInput: { flex: 1, padding: 0 },
  loading: { gap: Spacing.three, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  empty: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.five, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: AgentLayout.minTouch },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.four,
    paddingVertical: Spacing.two,
  },
  rowCopy: { flex: 1, gap: 1 },
  rowMenu: {
    width: AgentLayout.minTouch,
    height: AgentLayout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameBox: { gap: Spacing.three, paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  renameInput: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: hairline,
    borderColor: 'transparent',
  },
  renameSave: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
});
