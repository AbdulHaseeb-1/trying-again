import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AgentMessageReference } from '@/agent/protocol';
import type { StreamingMessage } from '@/agent/state/agent-reducer';
import { Markdown } from '@/agent/ui/markdown';
import { InlineNotice, TypingDots } from '@/agent/ui/primitives';
import { AgentLayout, AgentMotion, AgentType, hairline } from '@/agent/ui/tokens';
import { ToolCard } from '@/agent/ui/tool-card';
import { useReducedMotion } from '@/agent/ui/use-reduced-motion';

/**
 * One turn.
 *
 * The user's words sit in a tinted bubble; the assistant's do not. That
 * asymmetry is the single most effective thing a chat surface can do for
 * legibility — an assistant answer is long-form prose and reads better as
 * typeset text on the page than as a balloon, while a user's line is short and
 * benefits from being visibly theirs.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  onCitation,
  agentName,
}: {
  message: StreamingMessage;
  onCitation: (reference: AgentMessageReference) => void;
  agentName?: string | null;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  if (message.role === 'user') {
    return (
      <Animated.View
        testID="user-message"
        entering={reduceMotion ? undefined : FadeIn.duration(AgentMotion.enter)}
        style={styles.userRow}>
        <View style={[styles.userBubble, { backgroundColor: theme.surfaceVariant }]}>
          <ThemedText style={[AgentType.body, { color: theme.text }]} selectable>
            {message.text}
          </ThemedText>
          {message.attachments.length > 0 ? (
            <View style={styles.attachmentRow}>
              {message.attachments.map((attachment) => (
                <View
                  key={attachment.id}
                  style={[styles.attachmentChip, { backgroundColor: theme.surface }]}>
                  <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                    {attachment.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  const waiting = message.streaming && message.text.trim() === '';

  return (
    <Animated.View
      testID="assistant-message"
      entering={reduceMotion ? undefined : FadeIn.duration(AgentMotion.enter)}
      style={styles.assistantRow}>
      {agentName ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.speaker}>
          {agentName}
        </ThemedText>
      ) : null}

      {message.toolRuns.length > 0 ? (
        <View style={styles.tools}>
          {message.toolRuns.map((run) => (
            <ToolCard key={run.id} run={run} />
          ))}
        </View>
      ) : null}

      {waiting ? (
        <View style={styles.waiting}>
          <TypingDots color={theme.textMuted} />
        </View>
      ) : (
        <Markdown
          text={message.text}
          citationCount={message.references.length}
          onCitation={(index) => {
            const reference = message.references.find((entry) => entry.citationIndex === index);
            if (reference) onCitation(reference);
          }}
        />
      )}

      {message.error ? (
        <InlineNotice icon="warning" tone="danger" title={message.error.message} />
      ) : null}

      {!message.streaming && message.references.length > 0 ? (
        <SourceChips references={message.references} onCitation={onCitation} />
      ) : null}

      {message.model && !message.streaming ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.model}>
          {message.model.providerName} · {message.model.modelId}
        </ThemedText>
      ) : null}
    </Animated.View>
  );
});

/**
 * The source strip under an answer.
 *
 * Numbered to match the inline markers, so "[2]" in the text and the second
 * chip are visibly the same thing. Horizontal rather than wrapped: a research
 * answer can carry a dozen sources and a wrapped grid of them would dominate
 * the message it belongs to.
 */
function SourceChips({
  references,
  onCitation,
}: {
  references: AgentMessageReference[];
  onCitation: (reference: AgentMessageReference) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}
      contentContainerStyle={styles.chipRow}>
      {references.map((reference) => (
        <Pressable
          key={reference.id}
          testID="source-chip"
          accessibilityRole="button"
          accessibilityLabel={`Source ${reference.citationIndex}: ${reference.title}`}
          onPress={() => onCitation(reference)}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: pressed ? theme.surfaceVariant : theme.surface,
              borderColor: theme.border,
            },
          ]}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            {reference.citationIndex}
          </ThemedText>
          <AppIcon name={iconFor(reference)} size={12} color={theme.textMuted} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.chipLabel}>
            {/* The headline, not the publisher: six releases from the same
                calendar produce six identical chips otherwise, and the
                publisher is named in the preview the chip opens. */}
            {reference.title || reference.source}
          </ThemedText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function iconFor(reference: AgentMessageReference) {
  switch (reference.type) {
    case 'news':
      return 'news' as const;
    case 'web':
      return 'globe' as const;
    case 'chart':
      return 'chart' as const;
    case 'market_data':
      return 'trend' as const;
    default:
      return 'info' as const;
  }
}

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', maxWidth: AgentLayout.messageMaxWidth, alignSelf: 'stretch' },
  userBubble: {
    maxWidth: '88%',
    borderRadius: Radius.lg,
    borderBottomRightRadius: Radius.sm,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  attachmentChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: 2,
    maxWidth: 180,
  },
  assistantRow: { gap: Spacing.three, maxWidth: AgentLayout.messageMaxWidth },
  speaker: { letterSpacing: 0.2 },
  tools: { gap: Spacing.one },
  waiting: { height: 24, justifyContent: 'center' },
  chipScroll: { flexGrow: 0, marginHorizontal: -Spacing.four },
  chipRow: { gap: Spacing.two, paddingHorizontal: Spacing.four },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 28,
    maxWidth: 200,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: hairline,
  },
  chipLabel: { flexShrink: 1 },
  model: { fontSize: 11, lineHeight: 15 },
});
