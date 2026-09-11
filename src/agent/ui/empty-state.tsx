import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AgentSummary } from '@/agent/protocol';
import { AgentType, hairline } from '@/agent/ui/tokens';

/**
 * The panel before anything has been said.
 *
 * Two jobs, in order: say what this agent is for, and give three things worth
 * tapping. The starters come from the agent definition, so switching agent
 * changes the suggestions — which is the cheapest possible way to teach someone
 * what a specialist is good at.
 */
export function EmptyState({
  agent,
  onPick,
}: {
  agent: AgentSummary | null;
  onPick: (prompt: string) => void;
}) {
  const theme = useTheme();
  const starters = agent?.starters ?? [];

  return (
    <View style={styles.root}>
      <View style={[styles.mark, { backgroundColor: theme.surface }]}>
        <AppIcon name="sparkles" size={22} color={theme.primary} />
      </View>
      <ThemedText style={[AgentType.display, styles.title]}>
        {agent?.name ?? 'Market Assistant'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
        {agent?.description ??
          'Ask about the market, an upcoming release, or what just moved.'}
      </ThemedText>

      {starters.length > 0 ? (
        <View style={styles.starters}>
          {starters.map((starter) => (
            <Pressable
              key={starter}
              accessibilityRole="button"
              accessibilityLabel={starter}
              onPress={() => onPick(starter)}
              style={({ pressed }) => [
                styles.starter,
                {
                  backgroundColor: pressed ? theme.surfaceVariant : theme.surface,
                  borderColor: theme.border,
                },
              ]}>
              <ThemedText type="small" style={styles.starterText}>
                {starter}
              </ThemedText>
              <AppIcon name="chevron" size={13} color={theme.textMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Shown when no provider is configured yet — a setup prompt, not an error. */
export function NotConfiguredState({ onOpenSettings }: { onOpenSettings: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <View style={[styles.mark, { backgroundColor: theme.surface }]}>
        <AppIcon name="settings" size={22} color={theme.textSecondary} />
      </View>
      <ThemedText style={[AgentType.display, styles.title]}>Connect a provider</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
        The assistant needs an AI provider before it can answer. Add one — OpenAI,
        OpenRouter, Anthropic, Google, or any OpenAI-compatible endpoint.
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open AI settings"
        onPress={onOpenSettings}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: pressed ? theme.secondary : theme.primary },
        ]}>
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          Open AI settings
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.six,
    paddingVertical: Spacing.seven,
  },
  mark: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
  title: { textAlign: 'center' },
  description: { textAlign: 'center', maxWidth: 340 },
  starters: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.four, maxWidth: 420 },
  starter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: hairline,
  },
  starterText: { flex: 1 },
  cta: {
    marginTop: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.six,
    borderRadius: Radius.full,
  },
});
