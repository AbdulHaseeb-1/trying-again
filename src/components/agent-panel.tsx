import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { NewsItem } from '@/data/market';
import { useTheme } from '@/hooks/use-theme';

type AgentRole = 'assistant' | 'user';
type AgentMessage = { id: string; role: AgentRole; text: string };
type AnalysisRequest = { id: number; story: NewsItem };
type AgentPanelContextValue = { openAgent: () => void; closeAgent: () => void; analyzeNews: (story: NewsItem) => void };

const AgentPanelContext = createContext<AgentPanelContextValue | null>(null);

const starterMessages: AgentMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'I’m ready to connect the dots across macro, crypto, and derivatives. Ask about a market move or an upcoming event.',
  },
];

const suggestions = ['What is driving BTC?', 'Explain current funding', 'What matters before CPI?'];

export function AgentProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [activeStory, setActiveStory] = useState<NewsItem | null>(null);
  const [analysisRequest, setAnalysisRequest] = useState<AnalysisRequest | null>(null);
  const nextRequestId = useRef(0);

  const openAgent = () => {
    setActiveStory(null);
    setVisible(true);
  };
  const analyzeNews = (story: NewsItem) => {
    setActiveStory(story);
    setAnalysisRequest({ id: ++nextRequestId.current, story });
    setVisible(true);
  };

  return (
    <AgentPanelContext.Provider value={{ openAgent, closeAgent: () => setVisible(false), analyzeNews }}>
      {children}
      <AgentPanel visible={visible} activeStory={activeStory} analysisRequest={analysisRequest} onClose={() => setVisible(false)} />
    </AgentPanelContext.Provider>
  );
}

export function useAgentPanel() {
  const context = useContext(AgentPanelContext);
  if (!context) throw new Error('useAgentPanel must be used within AgentProvider.');
  return context;
}

function AgentPanel({
  visible,
  activeStory,
  analysisRequest,
  onClose,
}: {
  visible: boolean;
  activeStory: NewsItem | null;
  analysisRequest: AnalysisRequest | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState(starterMessages);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [visible]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, thinking]);

  const submit = useCallback((question = draft, responseText = buildMarketResponse(question)) => {
    const text = question.trim();
    if (!text || thinking) return;
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text }]);
    setDraft('');
    setThinking(true);
    setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: responseText,
        },
      ]);
      setThinking(false);
    }, 650);
  }, [draft, thinking]);

  const processedAnalysis = useRef<number | null>(null);
  useEffect(() => {
    if (!visible || !analysisRequest || thinking || processedAnalysis.current === analysisRequest.id) return;
    processedAnalysis.current = analysisRequest.id;
    submit(buildNewsAnalysisPrompt(analysisRequest.story), buildNewsAnalysisResponse(analysisRequest.story));
  }, [analysisRequest, submit, thinking, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close agent" onPress={onClose} style={[styles.backdrop, { backgroundColor: theme.overlay }]} />
        <Animated.View entering={SlideInDown.springify().damping(24).stiffness(190).mass(0.75)} style={[styles.panel, { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, Spacing.four) }]}>
          <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.handleWrap}><View style={[styles.handle, { backgroundColor: theme.borderStrong }]} /></View>
            <View style={styles.header}>
              <View style={styles.agentIdentity}>
                <View style={styles.agentMark}><AppIcon name="sparkles" size={19} color={theme.primary} /></View>
                <View><ThemedText style={styles.agentTitle}>MarketPulse AI</ThemedText><ThemedText type="small" themeColor="textSecondary">Your market intelligence agent</ThemedText></View>
              </View>
              <Tap accessibilityRole="button" accessibilityLabel="Close agent" onPress={onClose} haptic="none" style={[styles.close, { backgroundColor: theme.surfaceVariant }]}><AppIcon name="close" size={18} color={theme.textSecondary} /></Tap>
            </View>

            <View style={[styles.contextCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.contextHeader}><View style={styles.contextTitle}><View style={[styles.liveDot, { backgroundColor: theme.positive }]} /><ThemedText type="smallBold">Live market context</ThemedText></View><ThemedText type="small" themeColor="textMuted">Now</ThemedText></View>
              <View style={styles.contextMetrics}><ContextMetric label="BTC" value="$96,214" note="+2.4%" positive /><ContextMetric label="CPI" value="02h 37m" note="High impact" /><ContextMetric label="Funding" value="0.010%" note="Balanced" /></View>
            </View>
            {activeStory ? <StoryContextCard story={activeStory} /> : null}

            <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
              {thinking ? <ThinkingBubble /> : null}
            </ScrollView>

            <View style={styles.suggestions}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionList} keyboardShouldPersistTaps="handled">
                {suggestions.map((suggestion) => <Tap key={suggestion} accessibilityRole="button" onPress={() => submit(suggestion)} disabled={thinking} style={[styles.suggestion, { borderColor: theme.border, backgroundColor: theme.surface }]}><ThemedText type="small" themeColor="textSecondary">{suggestion}</ThemedText></Tap>)}
              </ScrollView>
            </View>

            <View style={[styles.composer, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask about the market…"
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={400}
                accessibilityLabel="Ask MarketPulse AI"
                style={[styles.input, { color: theme.text }]}
              />
              <Tap accessibilityRole="button" accessibilityLabel="Send message" onPress={() => submit()} disabled={!draft.trim() || thinking} haptic="success" style={[styles.send, { backgroundColor: draft.trim() && !thinking ? theme.primary : theme.surface }]}><AppIcon name="send" size={19} color={draft.trim() && !thinking ? theme.background : theme.textMuted} /></Tap>
            </View>
            <ThemedText type="small" themeColor="textMuted" style={styles.disclaimer}>AI analysis is informational, not financial advice.</ThemedText>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ContextMetric({ label, value, note, positive = false }: { label: string; value: string; note: string; positive?: boolean }) {
  const theme = useTheme();
  return <View style={styles.contextMetric}><ThemedText type="small" themeColor="textMuted">{label}</ThemedText><ThemedText style={styles.contextValue}>{value}</ThemedText><ThemedText type="small" style={{ color: positive ? theme.positive : theme.textSecondary }}>{note}</ThemedText></View>;
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const theme = useTheme();
  const user = message.role === 'user';
  return (
    <Animated.View entering={FadeIn.duration(180)} style={[styles.message, user ? styles.userMessage : styles.assistantMessage, { backgroundColor: user ? theme.surfaceVariant : 'transparent', borderColor: user ? theme.border : 'transparent' }]}>
      {!user ? <View style={styles.messageMark}><AppIcon name="sparkles" size={15} color={theme.primary} /></View> : null}
      <View style={styles.messageCopy}><ThemedText type="smallBold" style={{ color: user ? theme.textSecondary : theme.primary }}>{user ? 'You' : 'MarketPulse AI'}</ThemedText><ThemedText style={styles.messageText}>{message.text}</ThemedText></View>
    </Animated.View>
  );
}

function ThinkingBubble() {
  const theme = useTheme();
  return <Animated.View entering={FadeIn.duration(160)} style={styles.thinking}><AppIcon name="sparkles" size={16} color={theme.primary} /><ThemedText type="small" themeColor="textSecondary">Reading the market context…</ThemedText></Animated.View>;
}

function StoryContextCard({ story }: { story: NewsItem }) {
  const theme = useTheme();
  return (
    <View style={[styles.storyCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
      <View style={styles.storyHeader}>
        <View style={styles.storyLabel}><AppIcon name="sparkles" size={14} color={theme.primary} /><ThemedText type="smallBold" style={{ color: theme.primary }}>Analyzing story</ThemedText></View>
        <ThemedText type="small" themeColor="textMuted">{story.category}</ThemedText>
      </View>
      <ThemedText style={styles.storyHeadline}>{story.headline}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{story.time} · {story.impact} impact · {story.assets.join(' · ')}</ThemedText>
    </View>
  );
}

function buildNewsAnalysisPrompt(story: NewsItem) {
  return 'Analyze this ' + story.category.toLowerCase() + ' news story: “' + story.headline + '” It mentions ' + story.assets.join(', ') + '. Explain what it means, the likely market impact, the key risk, and what to watch next.';
}

function buildNewsAnalysisResponse(story: NewsItem) {
  if (story.category === 'MACRO') return 'This is a macro positioning story: softer dollar demand ahead of CPI can support gold, but the move is fragile until the inflation print confirms or rejects the setup. Watch DXY, real yields, and the CPI surprise together.';
  if (story.category === 'CRYPTO') return 'BTC open interest rising alongside spot demand is constructive, but it also raises liquidation risk. If price keeps advancing with balanced funding, the move has healthier participation; a sharp funding jump would suggest crowded longs.';
  if (story.category === 'FED') return 'The Fed is keeping optionality open, so the next data releases matter more than a firm policy signal. Watch inflation, labor data, Treasury yields, and the dollar for the next repricing of rate expectations.';
  if (story.category === 'GOLD') return 'Gold holding firm as real yields fall is a supportive macro signal. The main risk is a hotter inflation print that pushes yields and the dollar higher; watch real yields and DXY for confirmation.';
  return 'This is a modest risk-on signal rather than a decisive trend change. Watch whether megacap strength broadens into the wider index and whether yields stay contained; narrowing leadership would make the move more fragile.';
}

function buildMarketResponse(question: string) {
  const lower = question.toLowerCase();
  if (lower.includes('funding')) return 'BTC funding is positive at 0.010%, which means longs are paying shorts. It is constructive, but still below the kind of extreme level that usually signals crowded leverage.';
  if (lower.includes('cpi') || lower.includes('macro')) return 'CPI is the next high-impact catalyst in 02h 37m. A print above the 2.8% forecast could support the dollar and increase volatility across BTC, gold, and indices.';
  if (lower.includes('alert')) return 'A useful alert here is a BTC funding move above its historical threshold alongside a sharp open-interest increase. That combination would flag a potentially crowded long trade.';
  return 'BTC is up 2.4% while open interest is building and funding remains balanced. The setup points to leverage expansion ahead of CPI, so the main risk is a volatility spike around the release.';
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill },
  panel: { minHeight: '84%', maxHeight: '94%', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  keyboard: { flex: 1 },
  handleWrap: { alignItems: 'center', paddingTop: Spacing.two, paddingBottom: Spacing.one },
  handle: { width: 36, height: 4, borderRadius: Radius.full },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.four, paddingBottom: Spacing.four },
  agentIdentity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  agentMark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  agentTitle: { fontSize: 18, lineHeight: 22, fontWeight: '700' },
  close: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full },
  contextCard: { marginHorizontal: Spacing.four, padding: Spacing.three, gap: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg },
  contextHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contextTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: Radius.full },
  contextMetrics: { flexDirection: 'row' },
  contextMetric: { flex: 1, gap: 1 },
  contextValue: { fontSize: 15, lineHeight: 19, fontWeight: '700', fontVariant: ['tabular-nums'] },
  storyCard: { marginHorizontal: Spacing.four, padding: Spacing.three, gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg },
  storyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storyLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  storyHeadline: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  messages: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.four, gap: Spacing.three, flexGrow: 1, justifyContent: 'flex-end' },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, maxWidth: '94%' },
  assistantMessage: { paddingVertical: Spacing.one },
  userMessage: { alignSelf: 'flex-end', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.three },
  messageMark: { marginTop: 1, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
  messageCopy: { flex: 1, gap: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  suggestions: { minHeight: 42 },
  suggestionList: { gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  suggestion: { minHeight: 32, justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, marginHorizontal: Spacing.four, minHeight: 52, paddingLeft: Spacing.three, paddingRight: Spacing.one, paddingVertical: Spacing.one, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg },
  input: { flex: 1, maxHeight: 98, minHeight: 36, paddingVertical: Spacing.one, fontSize: 16, lineHeight: 21 },
  send: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  disclaimer: { textAlign: 'center', marginTop: Spacing.two, fontSize: 11, lineHeight: 15 },
});
