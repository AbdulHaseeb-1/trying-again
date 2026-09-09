import { Text } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

type IconName =
  | 'pulse'
  | 'news'
  | 'markets'
  | 'derivatives'
  | 'alerts'
  | 'search'
  | 'filter'
  | 'profile'
  | 'chevron'
  | 'back'
  | 'calendar'
  | 'bell'
  | 'sparkles'
  | 'trend'
  | 'chart'
  | 'percent'
  | 'watch'
  | 'plus'
  | 'close'
  | 'sliders'
  | 'eye'
  | 'send'
  | 'settings'
  | 'clock'
  | 'globe'
  | 'zap'
  | 'info';

const symbols: Record<IconName, unknown> = {
  pulse: { ios: 'waveform.path.ecg', android: 'monitor_heart', web: 'monitor_heart' },
  news: { ios: 'newspaper', android: 'article', web: 'article' },
  markets: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  derivatives: { ios: 'point.3.connected.trianglepath.dotted', android: 'hub', web: 'hub' },
  alerts: { ios: 'bell', android: 'notifications', web: 'notifications' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  filter: { ios: 'line.3.horizontal.decrease', android: 'tune', web: 'tune' },
  profile: { ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  back: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  bell: { ios: 'bell.badge', android: 'notifications_active', web: 'notifications_active' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  trend: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
  chart: { ios: 'chart.xyaxis.line', android: 'show_chart', web: 'show_chart' },
  percent: { ios: 'percent', android: 'percent', web: 'percent' },
  watch: { ios: 'star', android: 'star', web: 'star' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  sliders: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  eye: { ios: 'eye', android: 'visibility', web: 'visibility' },
  send: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  globe: { ios: 'globe', android: 'public', web: 'public' },
  zap: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
};

export function AppIcon({ name, size = 18, color }: { name: IconName; size?: number; color: string }) {
  if (name === 'sparkles') {
    return <Text style={{ color, fontSize: size, lineHeight: size, fontWeight: '700' }}>✦</Text>;
  }
  return <SymbolView name={symbols[name] as SymbolViewProps['name']} size={size} tintColor={color} />;
}

export type { IconName };
