import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppIcon, type IconName } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AgentLayout, AgentType, hairline } from '@/agent/ui/tokens';

/**
 * The grouped-list vocabulary the AI settings are built from.
 *
 * iOS Settings is the reference and the reason is not nostalgia: a
 * section-caption / card / hairline-separated-rows structure scales to dozens
 * of unrelated switches without any of them needing its own card, border or
 * heading. The alternative — a screen of boxes — is what makes configuration
 * screens feel like dashboards.
 */

export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      {title ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.groupTitle}>
          {title.toUpperCase()}
        </ThemedText>
      ) : null}
      <View style={[styles.card, { backgroundColor: theme.groupedCard }]}>{children}</View>
      {footer ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.groupFooter}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function SettingsRow({
  icon,
  title,
  detail,
  value,
  status,
  onPress,
  destructive,
  first,
  accessory = 'chevron',
}: {
  icon?: IconName;
  title: string;
  detail?: string;
  value?: string;
  status?: 'ok' | 'warning' | 'error' | 'muted';
  onPress?: () => void;
  destructive?: boolean;
  first?: boolean;
  accessory?: 'chevron' | 'none';
}) {
  const theme = useTheme();
  const statusColor =
    status === 'ok'
      ? theme.positive
      : status === 'warning'
        ? theme.warning
        : status === 'error'
          ? theme.negative
          : theme.textMuted;

  const body = (
    <View style={styles.rowInner}>
      {icon ? <AppIcon name={icon} size={17} color={theme.textSecondary} /> : null}
      <View style={styles.rowCopy}>
        <ThemedText
          style={[AgentType.body, { color: destructive ? theme.negative : theme.text }]}
          numberOfLines={1}>
          {title}
        </ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textMuted" numberOfLines={2}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {status ? <View style={[styles.statusDot, { backgroundColor: statusColor }]} /> : null}
      {value ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.rowValue}>
          {value}
        </ThemedText>
      ) : null}
      {onPress && accessory === 'chevron' ? (
        <AppIcon name="chevron" size={14} color={theme.textMuted} />
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View>
        {first ? null : <Hairline />}
        <View style={styles.row}>{body}</View>
      </View>
    );
  }

  return (
    <View>
      {first ? null : <Hairline />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={detail}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? theme.surfaceVariant : 'transparent' },
        ]}>
        {body}
      </Pressable>
    </View>
  );
}

export function SettingsSwitch({
  title,
  detail,
  value,
  onChange,
  first,
  disabled,
}: {
  title: string;
  detail?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  first?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View>
      {first ? null : <Hairline />}
      <View style={styles.row}>
        <View style={styles.rowInner}>
          <View style={styles.rowCopy}>
            <ThemedText style={[AgentType.body, { color: theme.text }]}>{title}</ThemedText>
            {detail ? (
              <ThemedText type="small" themeColor="textMuted">
                {detail}
              </ThemedText>
            ) : null}
          </View>
          <Switch
            value={value}
            onValueChange={onChange}
            disabled={disabled}
            accessibilityLabel={title}
            trackColor={{ false: theme.surfaceVariant, true: theme.primary }}
            thumbColor={theme.text}
          />
        </View>
      </View>
    </View>
  );
}

export function SettingsField({
  label,
  value,
  onChange,
  placeholder,
  secure,
  help,
  keyboardType,
  first,
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  secure?: boolean;
  help?: string;
  keyboardType?: 'default' | 'numeric' | 'url';
  first?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}) {
  const theme = useTheme();
  return (
    <View>
      {first ? null : <Hairline />}
      <View style={styles.fieldRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
          {label}
        </ThemedText>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={secure}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType === 'numeric' ? 'number-pad' : 'default'}
          accessibilityLabel={label}
          style={[styles.fieldInput, AgentType.body, { color: theme.text }]}
        />
      </View>
      {help ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.fieldHelp}>
          {help}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function SettingsButton({
  label,
  onPress,
  tone = 'primary',
  busy,
  disabled,
  first,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'neutral' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  first?: boolean;
}) {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.negative : tone === 'neutral' ? theme.text : theme.primary;
  return (
    <View>
      {first ? null : <Hairline />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: Boolean(disabled || busy) }}
        disabled={disabled || busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          styles.buttonRow,
          {
            backgroundColor: pressed ? theme.surfaceVariant : 'transparent',
            opacity: disabled ? 0.4 : 1,
          },
        ]}>
        <ThemedText type="smallBold" style={{ color }}>
          {busy ? 'Working…' : label}
        </ThemedText>
      </Pressable>
    </View>
  );
}

/** The outcome strip a "Test connection" leaves behind. */
export function ResultBanner({
  tone,
  title,
  detail,
}: {
  tone: 'ok' | 'warning' | 'error';
  title: string;
  detail?: string;
}) {
  const theme = useTheme();
  const color = tone === 'ok' ? theme.positive : tone === 'warning' ? theme.warning : theme.negative;
  return (
    <View style={[styles.banner, { backgroundColor: theme.groupedCard }]}>
      <AppIcon name={tone === 'ok' ? 'check' : 'warning'} size={16} color={color} />
      <View style={styles.rowCopy}>
        <ThemedText type="small" style={{ color: theme.text }}>
          {title}
        </ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textMuted">
            {detail}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function Hairline() {
  const theme = useTheme();
  return <View style={[styles.hairline, { backgroundColor: theme.separator }]} />;
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  groupTitle: { paddingHorizontal: Spacing.four, letterSpacing: 0.6, fontSize: 11 },
  groupFooter: { paddingHorizontal: Spacing.four, lineHeight: 17 },
  card: { borderRadius: Radius.md, overflow: 'hidden' },
  row: { minHeight: AgentLayout.minTouch, justifyContent: 'center' },
  buttonRow: { alignItems: 'center' },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  rowCopy: { flex: 1, gap: 1 },
  rowValue: { maxWidth: '45%', textAlign: 'right' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  hairline: { height: hairline, marginLeft: Spacing.four },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: AgentLayout.minTouch,
    paddingHorizontal: Spacing.four,
  },
  fieldLabel: { width: 104 },
  fieldInput: { flex: 1, paddingVertical: Spacing.three },
  fieldHelp: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.md,
  },
});
