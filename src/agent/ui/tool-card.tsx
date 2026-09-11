import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppIcon, type IconName } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AgentToolRun } from '@/agent/protocol';
import { TypingDots } from '@/agent/ui/primitives';
import { AgentMotion, AgentType, hairline } from '@/agent/ui/tokens';
import { useReducedMotion } from '@/agent/ui/use-reduced-motion';

/**
 * What a tool call looks like in a conversation.
 *
 * Collapsed, it is one quiet line — "Searching news… · 12 articles" — because
 * that is all a reader wants while an answer is being assembled. Raw JSON in
 * the transcript is noise that makes a chat look like a log file.
 *
 * Expanded, it shows what actually happened. Inputs and outputs appear only
 * when debug mode is on, and the server simply does not send them otherwise, so
 * this component cannot leak them by accident.
 */
export function ToolCard({ run }: { run: AgentToolRun }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const inspectable = run.status !== 'running';
  const icon = iconFor(run);
  const accent =
    run.status === 'failed'
      ? theme.negative
      : run.status === 'completed'
        ? theme.textMuted
        : theme.primary;

  return (
    <Animated.View
      testID="tool-card"
      entering={reduceMotion ? undefined : FadeIn.duration(AgentMotion.enter)}
      style={[styles.card, { backgroundColor: theme.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${run.label}${run.summary ? `, ${run.summary}` : ''}`}
        accessibilityHint={inspectable ? 'Shows the tool call details' : undefined}
        disabled={!inspectable}
        onPress={() => setExpanded((current) => !current)}
        style={styles.head}>
        <AppIcon name={icon} size={14} color={accent} />
        <ThemedText
          type="small"
          style={[styles.label, { color: run.status === 'failed' ? theme.negative : theme.textSecondary }]}
          numberOfLines={1}>
          {run.label}
          {run.status === 'running' ? '…' : ''}
        </ThemedText>

        {run.status === 'running' ? (
          <TypingDots color={theme.primary} />
        ) : (
          <>
            {run.summary ? (
              <ThemedText type="small" themeColor="textMuted" numberOfLines={1} style={styles.summary}>
                {run.summary}
              </ThemedText>
            ) : null}
            {inspectable ? (
              <AppIcon name={expanded ? 'expand' : 'collapse'} size={13} color={theme.textMuted} />
            ) : null}
          </>
        )}
      </Pressable>

      {expanded ? (
        <View style={[styles.details, { borderTopColor: theme.border }]}>
          <DetailRow label="Tool" value={run.tool} />
          <DetailRow label="Status" value={run.status} />
          {run.durationMs !== undefined ? (
            <DetailRow label="Duration" value={`${run.durationMs} ms`} />
          ) : null}
          {run.error ? <DetailRow label="Error" value={run.error.message} tone="danger" /> : null}
          {run.input !== undefined ? <Payload title="Input" value={run.input} /> : null}
          {run.output !== undefined ? <Payload title="Output" value={run.output} /> : null}
          {run.input === undefined && run.output === undefined ? (
            <ThemedText type="small" themeColor="textMuted">
              Turn on debug mode in Settings → AI &amp; Agents to see tool inputs and outputs.
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger';
}) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textMuted" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText
        type="small"
        style={[styles.detailValue, { color: tone === 'danger' ? theme.negative : theme.text }]}>
        {value}
      </ThemedText>
    </View>
  );
}

function Payload({ title, value }: { title: string; value: unknown }) {
  const theme = useTheme();
  const text = safeStringify(value);
  return (
    <View style={styles.payload}>
      <ThemedText type="small" themeColor="textMuted" style={styles.detailLabel}>
        {title}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.payloadBox, { backgroundColor: theme.surfaceVariant }]}>
        <Text selectable style={[styles.payloadText, { color: theme.textSecondary }]}>
          {text}
        </Text>
      </ScrollView>
    </View>
  );
}

function safeStringify(value: unknown): string {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    // Debug output can be enormous; the inspector is for shape, not for bulk.
    return text.length > 4_000 ? `${text.slice(0, 4_000)}\n… truncated` : text;
  } catch {
    return String(value);
  }
}

/** The glyph follows the tool's domain, so a reader learns the shapes. */
function iconFor(run: AgentToolRun): IconName {
  if (run.status === 'failed') return 'warning';
  if (run.tool.includes('news')) return 'news';
  if (run.tool.startsWith('web_')) return 'globe';
  if (run.tool.includes('chart') || run.tool.includes('timeframe') || run.tool.includes('symbol')) {
    return 'chart';
  }
  if (run.tool.includes('calendar') || run.tool.includes('release')) return 'calendar';
  if (run.tool.startsWith('ask_')) return 'handoff';
  return 'tool';
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 34,
    paddingHorizontal: Spacing.three,
  },
  label: { flexShrink: 1 },
  summary: { marginLeft: 'auto', maxWidth: '45%', textAlign: 'right' },
  details: {
    borderTopWidth: hairline,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  detailRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  detailLabel: { width: 68 },
  detailValue: { flex: 1, ...AgentType.meta },
  payload: { gap: Spacing.one },
  payloadBox: { borderRadius: Radius.sm, maxHeight: 180 },
  payloadText: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 16, padding: Spacing.three },
});
