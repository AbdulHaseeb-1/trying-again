import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideInRight,
  SlideOutDown,
  SlideOutRight,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { trackSheetOpen } from '@/components/sheet-visibility';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AgentMessageReference } from '@/agent/protocol';
import { useAgentStore } from '@/agent/state/agent-store';
import { useAppContext } from '@/agent/state/app-context';
import { Composer } from '@/agent/ui/composer';
import { ConversationList } from '@/agent/ui/conversation-list';
import { EmptyState, NotConfiguredState } from '@/agent/ui/empty-state';
import { MessageBubble } from '@/agent/ui/message-bubble';
import { PanelHeader } from '@/agent/ui/panel-header';
import { InlineNotice, Menu, MenuItem } from '@/agent/ui/primitives';
import { SourceSheet } from '@/agent/ui/source-sheet';
import { AgentLayout, AgentMotion, hairline, softShadow } from '@/agent/ui/tokens';
import { useReducedMotion } from '@/agent/ui/use-reduced-motion';

/**
 * The Agent Panel.
 *
 * One component, two presentations, chosen by width rather than by platform:
 *
 *  - **Wide** (a tablet, a desktop browser): a docked right-hand panel that the
 *    user can drag to resize, with the application still visible beside it.
 *    An assistant you consult *while* looking at a chart has to leave the chart
 *    on screen.
 *  - **Narrow** (a phone): a full-height sheet with a grabber, a bottom
 *    composer and safe-area padding — the shape a native assistant takes, not a
 *    sidebar squeezed into 390 points.
 *
 * Everything inside is shared, so the two never drift.
 */
export function AgentPanel() {
  const store = useAgentStore();
  const { width } = useWindowDimensions();
  const docked = width >= AgentLayout.dockBreakpoint;

  if (!store.visible) return null;
  return docked ? <DockedPanel /> : <SheetPanel />;
}

// ------------------------------------------------------------------- shared

function useConversationView() {
  const store = useAgentStore();
  const appContext = useAppContext();
  const router = useRouter();
  const scroller = useRef<ScrollView>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [source, setSource] = useState<AgentMessageReference | null>(null);

  const agent = useMemo(
    () => store.bootstrap?.agents.find((entry) => entry.id === store.agentId) ?? null,
    [store.agentId, store.bootstrap],
  );

  // Follow the stream. `animated` only once the conversation has content, so
  // opening an existing thread lands at the bottom without a visible scroll.
  const messageCount = store.messages.length;
  const lastLength = store.messages[messageCount - 1]?.text.length ?? 0;
  useEffect(() => {
    const timer = setTimeout(
      () => scroller.current?.scrollToEnd({ animated: messageCount > 1 }),
      16,
    );
    return () => clearTimeout(timer);
  }, [messageCount, lastLength]);

  const openSettings = useCallback(() => {
    store.close();
    router.push('/settings/ai');
  }, [router, store]);

  return {
    store,
    agent,
    appContext,
    scroller,
    historyOpen,
    setHistoryOpen,
    menuOpen,
    setMenuOpen,
    source,
    setSource,
    openSettings,
  };
}

function ConversationBody({
  view,
}: {
  view: ReturnType<typeof useConversationView>;
}) {
  const theme = useTheme();
  const { store, agent, scroller, setSource, openSettings } = view;

  const ready = store.bootstrap?.ready ?? true;
  const empty = store.messages.length === 0;

  return (
    <ScrollView
      ref={scroller}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}>
      {/* The transcript keeps its reading measure and centres in whatever it is
          given. Without this the sheet at tablet width leaves a column of empty
          space down one side while the composer spans the whole screen. */}
      <View style={[styles.measure, empty && styles.measureEmpty]}>
        {store.bootstrapError ? (
          <InlineNotice
            icon="warning"
            tone="danger"
            title="The agent service is unreachable"
            detail={store.bootstrapError}
          />
        ) : !ready ? (
          <NotConfiguredState onOpenSettings={openSettings} />
        ) : empty ? (
          <EmptyState agent={agent} onPick={(prompt) => store.send(prompt)} />
        ) : (
          store.messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              onCitation={setSource}
              agentName={
                message.role === 'assistant' &&
                (index === 0 || store.messages[index - 1].role === 'user')
                  ? (store.activeAgentName ?? agent?.name ?? null)
                  : null
              }
            />
          ))
        )}

        {store.handoff ? (
          <InlineNotice
            icon="handoff"
            title={`Handed off to ${store.handoff.to}`}
            detail={`${store.handoff.from} passed this conversation on.`}
          />
        ) : null}

        {store.fallback ? (
          <InlineNotice
            icon="refresh"
            tone="warning"
            title={`Switched to ${store.fallback.to.providerName}`}
            detail={`${store.fallback.from.providerId}/${store.fallback.from.modelId} → ${store.fallback.to.providerId}/${store.fallback.to.modelId} · ${store.fallback.reason.message}`}
          />
        ) : null}

        {store.error ? (
          <InlineNotice
            icon="warning"
            tone="danger"
            title={store.error.message}
            detail={store.error.detail}
            actionLabel={store.error.retryable ? 'Retry' : 'Dismiss'}
            onAction={store.error.retryable ? store.retry : store.dismissError}
          />
        ) : null}

        {store.statusText && store.status === 'streaming' ? (
          <ThemedText type="small" themeColor="textMuted" style={styles.status}>
            {store.statusText}…
          </ThemedText>
        ) : null}

        <View style={{ height: Spacing.four, backgroundColor: theme.background }} />
      </View>
    </ScrollView>
  );
}

function PanelChrome({
  view,
  onClose,
  closeIcon,
  closeLabel,
}: {
  view: ReturnType<typeof useConversationView>;
  onClose: () => void;
  closeIcon?: 'close' | 'collapse';
  closeLabel?: string;
}) {
  const {
    store,
    agent,
    appContext,
    historyOpen,
    setHistoryOpen,
    menuOpen,
    setMenuOpen,
    source,
    setSource,
    openSettings,
  } = view;

  return (
    <>
      <PanelHeader
        agent={agent}
        status={store.status === 'streaming' ? (store.statusText ?? 'Working') : null}
        live={store.status === 'streaming'}
        onNew={() => void store.newConversation()}
        onHistory={() => setHistoryOpen(true)}
        onMore={() => setMenuOpen(true)}
        onClose={onClose}
        closeIcon={closeIcon}
        closeLabel={closeLabel}
      />

      <ConversationBody view={view} />

      <View style={styles.composerWrap}>
        <Composer
          agent={agent}
          agents={store.bootstrap?.agents ?? []}
          streaming={store.status === 'streaming'}
          attachments={store.attachments}
          suggestions={appContext.suggestedAttachments()}
          draft={store.draft}
          onDraftChange={store.setDraft}
          onSend={store.send}
          onStop={store.stop}
          onAttach={store.attach}
          onDetach={store.detach}
          onSelectAgent={store.setAgent}
        />
      </View>

      <ConversationList
        visible={historyOpen}
        conversations={store.conversations}
        loading={store.conversationsLoading}
        activeId={store.conversation?.id ?? null}
        onClose={() => setHistoryOpen(false)}
        onSelect={(id) => void store.selectConversation(id)}
        onSearch={(query) => void store.refreshConversations(query)}
        onRename={(id, title) => void store.renameConversation(id, title)}
        onTogglePin={(id, pinned) => void store.togglePin(id, pinned)}
        onDelete={(id) => void store.removeConversation(id)}
      />

      <Menu visible={menuOpen} onClose={() => setMenuOpen(false)} title="Assistant">
        {(store.bootstrap?.agents ?? []).map((entry) => (
          <MenuItem
            key={entry.id}
            icon="sparkles"
            label={entry.name}
            detail={entry.model ? `${entry.model.providerId} · ${entry.model.modelId}` : 'Not configured'}
            selected={entry.id === store.agentId}
            onPress={() => {
              store.setAgent(entry.id);
              setMenuOpen(false);
            }}
          />
        ))}
        <View style={styles.menuGap} />
        <MenuItem
          icon="settings"
          label="AI & Agents settings"
          onPress={() => {
            setMenuOpen(false);
            openSettings();
          }}
        />
        {store.conversation ? (
          <MenuItem
            icon="trash"
            label="Delete this conversation"
            destructive
            onPress={() => {
              const id = store.conversation?.id;
              setMenuOpen(false);
              if (id) void store.removeConversation(id);
            }}
          />
        ) : null}
      </Menu>

      <SourceSheet reference={source} onClose={() => setSource(null)} />
    </>
  );
}

// ------------------------------------------------------------------- docked

function DockedPanel() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const view = useConversationView();
  const reduceMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();

  const [panelWidth, setPanelWidth] = useState<number>(AgentLayout.dockedDefaultWidth);
  const startWidth = useSharedValue<number>(AgentLayout.dockedDefaultWidth);

  const maxWidth = Math.min(AgentLayout.dockedMaxWidth, Math.round(windowWidth * 0.5));
  const clamp = useCallback(
    (value: number) => Math.max(AgentLayout.dockedMinWidth, Math.min(maxWidth, value)),
    [maxWidth],
  );

  // Dragging the left edge resizes. A panel you cannot size is a panel that is
  // the wrong size for somebody.
  const resize = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          startWidth.value = panelWidth;
        })
        .onUpdate((event) => {
          runOnJS(setPanelWidth)(clamp(startWidth.value - event.translationX));
        }),
    [clamp, panelWidth, startWidth],
  );

  return (
    <View style={styles.dockRoot} pointerEvents="box-none">
      <Animated.View
        testID="agent-panel-docked"
        entering={reduceMotion ? undefined : SlideInRight.duration(220)}
        exiting={reduceMotion ? undefined : SlideOutRight.duration(AgentMotion.exit)}
        style={[
          styles.dockPanel,
          softShadow,
          {
            width: panelWidth,
            backgroundColor: theme.background,
            borderLeftColor: theme.border,
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, Spacing.three),
          },
        ]}>
        <GestureDetector gesture={resize}>
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="Resize the assistant panel"
            style={styles.resizeHandle}>
            <View style={[styles.resizeGrip, { backgroundColor: theme.border }]} />
          </View>
        </GestureDetector>

        <PanelChrome
          view={view}
          onClose={view.store.close}
          closeIcon="collapse"
          closeLabel="Collapse the assistant"
        />
      </Animated.View>
    </View>
  );
}

// -------------------------------------------------------------------- sheet

function SheetPanel() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const view = useConversationView();
  const reduceMotion = useReducedMotion();

  const dragY = useSharedValue(0);
  const close = view.store.close;

  // Downward drag on the grabber dismisses, exactly as a native sheet does.
  // Bound to the grabber alone so it never fights the transcript's scrolling.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-100_000, 8])
        .failOffsetX([-16, 16])
        .onUpdate((event) => {
          dragY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          if (event.translationY > 120 || event.velocityY > 900) {
            runOnJS(close)();
            dragY.value = 0;
          } else {
            dragY.value = withSpring(0, AgentMotion.spring);
          }
        })
        .onFinalize((_event, success) => {
          if (!success) dragY.value = withSpring(0, AgentMotion.spring);
        }),
    [close, dragY],
  );

  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  // The panel is mounted only while `store.visible` is true (see `AgentPanel`
  // above), so tracking for exactly this component's lifetime is tracking for
  // exactly the sheet's open duration — no separate visible flag to thread through.
  useEffect(() => trackSheetOpen(), []);

  // Android's `Modal` opens a second native window on top of the Activity's
  // own — which is where the floating tab bar lives, absolutely positioned
  // with its own elevation. The two windows don't always agree on stacking or
  // on how much of the screen the keyboard inset covers, which is what shows
  // up as a flash of the (transparent) Activity window behind the sheet,
  // worst around the composer when the keyboard opens or closes. Rendering
  // the sheet in-tree instead — a plain absolute-fill View, later in paint
  // order than the tab bar — sidesteps the second window entirely. `BottomSheet`
  // takes the same approach for the same reason.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const content = (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(AgentMotion.enter)}
      exiting={reduceMotion ? undefined : FadeOut.duration(AgentMotion.exit)}
      style={styles.sheetRoot}>
      {/* Distinct from the header's close control: two buttons with the same
          name is ambiguous to a screen reader and to anything else reading
          the accessibility tree. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss the assistant"
        onPress={close}
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}
      />
      <Animated.View
        testID="agent-panel-sheet"
        entering={
          reduceMotion ? undefined : SlideInDown.springify().damping(26).stiffness(250).mass(0.7)
        }
        exiting={reduceMotion ? undefined : SlideOutDown.duration(AgentMotion.exit)}
        style={[
          styles.sheet,
          dragStyle,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.border,
            marginTop: Math.max(insets.top, Spacing.five),
          },
        ]}>
        <KeyboardAvoidingView
          style={styles.flex}
          // The composer must ride the keyboard, and the two platforms need
          // different behaviours to do it without a gap or an overlap.
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
          <GestureDetector gesture={pan}>
            <View collapsable={false} style={styles.grabberArea}>
              <View style={[styles.grabber, { backgroundColor: theme.borderStrong }]} />
            </View>
          </GestureDetector>

          <PanelChrome view={view} onClose={close} />

          <View style={[{ height: Math.max(insets.bottom, Spacing.three) }, { backgroundColor: theme.background }]} />
        </KeyboardAvoidingView>
      </Animated.View>
    </Animated.View>
  );

  if (Platform.OS === 'android') {
    return <View style={styles.androidRoot}>{content}</View>;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dockRoot: { ...StyleSheet.absoluteFill, flexDirection: 'row', justifyContent: 'flex-end' },
  dockPanel: { height: '100%', borderLeftWidth: hairline, flexDirection: 'column' },
  resizeHandle: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  resizeGrip: { width: 3, height: 44, borderRadius: Radius.full },
  androidRoot: { ...StyleSheet.absoluteFill, zIndex: 70, elevation: 70 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    flex: 1,
    borderTopWidth: hairline,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  grabberArea: { alignItems: 'center', paddingTop: Spacing.two, paddingBottom: Spacing.one },
  grabber: { width: 36, height: 5, borderRadius: Radius.full },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.four,
    flexGrow: 1,
  },
  measure: {
    width: '100%',
    maxWidth: AgentLayout.messageMaxWidth,
    alignSelf: 'center',
    gap: Spacing.five,
    flexGrow: 1,
  },
  measureEmpty: { justifyContent: 'center' },
  status: { paddingLeft: 2 },
  composerWrap: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    width: '100%',
    maxWidth: AgentLayout.messageMaxWidth + Spacing.four * 2,
    alignSelf: 'center',
  },
  menuGap: { height: Spacing.three },
});
