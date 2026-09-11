import { useCallback, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AgentContextAttachment, AgentSummary } from '@/agent/protocol';
import { IconButton, Menu, MenuItem } from '@/agent/ui/primitives';
import { AgentLayout, AgentType, hairline } from '@/agent/ui/tokens';

/**
 * The composer.
 *
 * Everything rarely used is behind the "+" menu; what stays on screen is the
 * field, the attach control and one primary button that is either send or stop.
 * A row of permanent toggles is the fastest way to make an assistant feel like
 * a control panel, so there is exactly one of them and it is contextual.
 */
export function Composer({
  agent,
  agents,
  streaming,
  attachments,
  suggestions,
  draft,
  onDraftChange,
  onSend,
  onStop,
  onAttach,
  onDetach,
  onSelectAgent,
}: {
  agent: AgentSummary | null;
  agents: AgentSummary[];
  streaming: boolean;
  attachments: AgentContextAttachment[];
  suggestions: AgentContextAttachment[];
  /** Owned by the store: a draft survives closing the panel, and a suggested
   *  prompt is a write rather than an effect that races the first render. */
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttach: (attachment: AgentContextAttachment) => void;
  onDetach: (id: string) => void;
  onSelectAgent: (agentId: string) => void;
}) {
  const theme = useTheme();
  const [height, setHeight] = useState<number>(AgentLayout.composerMinHeight);
  const [menuOpen, setMenuOpen] = useState(false);
  const input = useRef<TextInput | null>(null);

  /**
   * Grow with the text, and shrink back when it is deleted.
   *
   * On the web the field measures itself rather than being driven from state.
   * React Native Web implements `onContentSizeChange` by reading the element's
   * `scrollHeight` and reporting it only when it *changes* — but the element is
   * locked to the height already applied, so its scroll height can never fall
   * below it. A composer driven that way opens too tall, grows as you type and
   * then never shrinks again when you delete. Collapsing the element before
   * reading it gives the intrinsic height of the text, and writing the result
   * straight back keeps React out of a loop it cannot see the end of.
   */
  const fitToText = useCallback((node: HTMLTextAreaElement | null) => {
    if (!node?.style) return;
    node.style.height = '0px';
    node.style.height = `${Math.min(
      AgentLayout.composerMaxHeight,
      Math.max(AgentLayout.composerMinHeight, node.scrollHeight),
    )}px`;
  }, []);

  const attachInput = useCallback(
    (instance: TextInput | null) => {
      input.current = instance;
      // A draft restored from the store arrives without a change event, so the
      // first measurement happens as the field is attached.
      if (Platform.OS === 'web') fitToText(instance as unknown as HTMLTextAreaElement | null);
    },
    [fitToText],
  );

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || streaming) return;
    if (Platform.OS === 'web') {
      // The field is about to be emptied by the store, which is not a change
      // event either; put it back to one line now rather than a frame later.
      const node = input.current as unknown as HTMLTextAreaElement | null;
      if (node?.style) node.style.height = `${AgentLayout.composerMinHeight}px`;
    } else {
      setHeight(AgentLayout.composerMinHeight);
    }
    onSend(text);
  }, [draft, onSend, streaming]);

  /**
   * Enter sends, Shift+Enter breaks the line — the convention every chat
   * surface on a desktop keyboard uses. On a phone the return key inserts a
   * newline as usual, because there is no modifier to hold.
   */
  const onKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (Platform.OS !== 'web') return;
      const native = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
      if (native.key === 'Enter' && !native.shiftKey) {
        event.preventDefault?.();
        submit();
      }
    },
    [submit],
  );

  const canSend = draft.trim().length > 0 && !streaming;
  const unusedSuggestions = suggestions.filter(
    (suggestion) => !attachments.some((entry) => entry.id === suggestion.id),
  );

  return (
    <View style={styles.root}>
      {attachments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}>
          {attachments.map((attachment) => (
            <View
              key={attachment.id}
              style={[styles.chip, { backgroundColor: theme.surfaceVariant }]}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.chipLabel}>
                {attachment.label}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${attachment.label}`}
                onPress={() => onDetach(attachment.id)}
                hitSlop={10}>
                <AppIcon name="close" size={12} color={theme.textMuted} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <IconButton
          icon="plus"
          label="Add context"
          onPress={() => setMenuOpen(true)}
          style={styles.leading}
        />
        <TextInput
          ref={attachInput}
          value={draft}
          onChangeText={onDraftChange}
          onKeyPress={onKeyPress}
          onChange={
            Platform.OS === 'web'
              ? (event) => fitToText((event as unknown as { target: HTMLTextAreaElement }).target)
              : undefined
          }
          onContentSizeChange={
            Platform.OS === 'web'
              ? undefined
              : (event) =>
                  setHeight(
                    Math.min(
                      AgentLayout.composerMaxHeight,
                      Math.max(
                        AgentLayout.composerMinHeight,
                        event.nativeEvent.contentSize.height + 10,
                      ),
                    ),
                  )
          }
          placeholder={agent ? `Ask ${agent.name}…` : 'Ask about the market…'}
          placeholderTextColor={theme.textMuted}
          multiline
          maxLength={4_000}
          accessibilityLabel="Message"
          submitBehavior="newline"
          style={[
            styles.input,
            AgentType.body,
            { color: theme.text },
            // Native drives the height from state; on the web the element owns
            // it, and only the bounds come from here.
            Platform.OS === 'web'
              ? {
                  minHeight: AgentLayout.composerMinHeight,
                  maxHeight: AgentLayout.composerMaxHeight,
                }
              : { height },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={streaming ? 'Stop generating' : 'Send message'}
          accessibilityState={{ disabled: !streaming && !canSend }}
          disabled={!streaming && !canSend}
          onPress={streaming ? onStop : submit}
          hitSlop={8}
          style={({ pressed }) => [
            styles.send,
            {
              backgroundColor: streaming
                ? theme.surfaceVariant
                : canSend
                  ? theme.primary
                  : theme.surfaceVariant,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <AppIcon
            name={streaming ? 'stop' : 'send'}
            size={17}
            color={streaming ? theme.text : canSend ? theme.background : theme.textMuted}
          />
        </Pressable>
      </View>

      <Menu visible={menuOpen} onClose={() => setMenuOpen(false)} title="Add context">
        {unusedSuggestions.length === 0 ? (
          <MenuItem
            label="Nothing to attach yet"
            detail="Open a chart or a market to attach it here"
            onPress={() => setMenuOpen(false)}
          />
        ) : (
          unusedSuggestions.map((suggestion) => (
            <MenuItem
              key={suggestion.id}
              icon={suggestion.kind === 'session' ? 'clock' : 'chart'}
              label={suggestion.label}
              detail={kindLabel(suggestion.kind)}
              onPress={() => {
                onAttach(suggestion);
                setMenuOpen(false);
              }}
            />
          ))
        )}

        {agents.length > 1 ? (
          <>
            <View style={styles.menuGap} />
            <ThemedText type="small" themeColor="textMuted" style={styles.menuHeading}>
              ANSWER AS
            </ThemedText>
            {agents.map((entry) => (
              <MenuItem
                key={entry.id}
                icon="sparkles"
                label={entry.name}
                detail={entry.model ? `${entry.model.providerId} · ${entry.model.modelId}` : 'Not configured'}
                selected={entry.id === agent?.id}
                onPress={() => {
                  onSelectAgent(entry.id);
                  setMenuOpen(false);
                }}
              />
            ))}
          </>
        ) : null}
      </Menu>
    </View>
  );
}

function kindLabel(kind: AgentContextAttachment['kind']): string {
  switch (kind) {
    case 'chart':
      return 'Chart';
    case 'session':
      return 'Trading session';
    case 'news':
      return 'News article';
    case 'market_snapshot':
      return 'Market snapshot';
    case 'calendar_event':
      return 'Economic release';
    default:
      return 'Context';
  }
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: Spacing.two, paddingHorizontal: Spacing.one },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 28,
    maxWidth: 220,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: Radius.full,
  },
  chipLabel: { flexShrink: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.one,
    borderRadius: Radius.xl,
    borderWidth: hairline,
  },
  leading: { marginBottom: 3 },
  input: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 11 : 8,
    paddingBottom: Platform.OS === 'ios' ? 11 : 8,
    paddingHorizontal: Spacing.one,
    textAlignVertical: 'top',
  },
  send: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    marginBottom: 3,
  },
  menuGap: { height: Spacing.three },
  menuHeading: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.one,
    letterSpacing: 0.6,
    fontSize: 11,
  },
});
