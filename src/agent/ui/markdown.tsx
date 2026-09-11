import { useMemo, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { marked, type Token, type Tokens } from 'marked';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { citationIndices } from '@/agent/ui/citation-markers';
import { AgentType, hairline } from '@/agent/ui/tokens';

/**
 * Markdown, rendered as React Native views.
 *
 * `marked` does the parsing — a correct CommonMark tokenizer is not something
 * worth hand-rolling — and this file owns only the rendering, because that is
 * the part that has to obey the application's type scale, colours and touch
 * targets. The React Native markdown libraries all ship their own styling
 * opinions and most have not kept up with recent RN releases; a tokenizer plus
 * fifty lines of renderer is both smaller and ours.
 *
 * Citation markers are intercepted here: `[2]` becomes a tappable chip rather
 * than literal text, and an index with no matching reference is never produced
 * because the server already removed it.
 */

export type CitationHandler = (index: number) => void;

export function Markdown({
  text,
  onCitation,
  citationCount = 0,
}: {
  text: string;
  onCitation?: CitationHandler;
  citationCount?: number;
}) {
  const tokens = useMemo(() => {
    try {
      return marked.lexer(text ?? '');
    } catch {
      // A half-streamed document can be briefly unparseable. Showing the raw
      // text is far better than showing nothing while it completes.
      return [{ type: 'paragraph', raw: text, text } as unknown as Token];
    }
  }, [text]);

  return (
    <View style={styles.root}>
      {tokens.map((token, index) => (
        <Block
          key={`${token.type}-${index}`}
          token={token}
          onCitation={onCitation}
          citationCount={citationCount}
        />
      ))}
    </View>
  );
}

function Block({
  token,
  onCitation,
  citationCount,
}: {
  token: Token;
  onCitation?: CitationHandler;
  citationCount: number;
}) {
  const theme = useTheme();

  switch (token.type) {
    case 'space':
      return null;

    case 'heading': {
      const heading = token as Tokens.Heading;
      return (
        <ThemedText
          accessibilityRole="header"
          style={[heading.depth <= 2 ? styles.h2 : styles.h3, { color: theme.text }]}>
          <Inline text={heading.text} onCitation={onCitation} citationCount={citationCount} />
        </ThemedText>
      );
    }

    case 'paragraph': {
      const paragraph = token as Tokens.Paragraph;
      return (
        <ThemedText style={[AgentType.body, styles.paragraph, { color: theme.text }]}>
          <Inline text={paragraph.text} onCitation={onCitation} citationCount={citationCount} />
        </ThemedText>
      );
    }

    case 'list': {
      const list = token as Tokens.List;
      return (
        <View style={styles.list}>
          {list.items.map((item, index) => (
            <View key={index} style={styles.listItem}>
              <ThemedText style={[AgentType.body, styles.bullet, { color: theme.textMuted }]}>
                {list.ordered ? `${Number(list.start || 1) + index}.` : '•'}
              </ThemedText>
              <ThemedText style={[AgentType.body, styles.listCopy, { color: theme.text }]}>
                <Inline text={item.text} onCitation={onCitation} citationCount={citationCount} />
              </ThemedText>
            </View>
          ))}
        </View>
      );
    }

    case 'code': {
      const code = token as Tokens.Code;
      return (
        <View style={[styles.codeBlock, { backgroundColor: theme.surfaceVariant }]}>
          {code.lang ? (
            <ThemedText type="small" themeColor="textMuted" style={styles.codeLang}>
              {code.lang}
            </ThemedText>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text selectable style={[styles.code, { color: theme.text }]}>
              {code.text}
            </Text>
          </ScrollView>
        </View>
      );
    }

    case 'blockquote': {
      const quote = token as Tokens.Blockquote;
      return (
        <View style={[styles.quote, { borderLeftColor: theme.borderStrong }]}>
          {quote.tokens.map((child, index) => (
            <Block
              key={index}
              token={child}
              onCitation={onCitation}
              citationCount={citationCount}
            />
          ))}
        </View>
      );
    }

    case 'table': {
      const table = token as Tokens.Table;
      return (
        // Tables get their own horizontal scroller so a wide comparison never
        // forces the whole message column to scroll sideways.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tableScroll}
          contentContainerStyle={[styles.table, { borderColor: theme.border }]}>
          <View>
            <View style={[styles.tableRow, { backgroundColor: theme.surfaceVariant }]}>
              {table.header.map((cell, index) => (
                <ThemedText key={index} type="smallBold" style={styles.tableCell} numberOfLines={2}>
                  {stripInline(cell.text)}
                </ThemedText>
              ))}
            </View>
            {table.rows.map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={[styles.tableRow, { borderTopColor: theme.border, borderTopWidth: hairline }]}>
                {row.map((cell, index) => (
                  <ThemedText key={index} type="small" style={styles.tableCell}>
                    {stripInline(cell.text)}
                  </ThemedText>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }

    case 'hr':
      return <View style={[styles.rule, { backgroundColor: theme.separator }]} />;

    default: {
      const raw = 'raw' in token ? String(token.raw) : '';
      if (!raw.trim()) return null;
      return (
        <ThemedText style={[AgentType.body, styles.paragraph, { color: theme.text }]}>
          <Inline text={raw} onCitation={onCitation} citationCount={citationCount} />
        </ThemedText>
      );
    }
  }
}

/**
 * Inline markup and citation chips.
 *
 * Deliberately a small hand-written pass rather than a second trip through the
 * tokenizer: what is needed inside a line is bold, italic, code, links and
 * citations, and nesting beyond one level does not occur in model output often
 * enough to justify a recursive renderer.
 */
function Inline({
  text,
  onCitation,
  citationCount,
}: {
  text: string;
  onCitation?: CitationHandler;
  citationCount: number;
}): ReactNode {
  const theme = useTheme();
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|\[[^\]]*\]\([^)]+\)|\[\d+(?:,\s*\d+)*\])/g;
  const parts = text.split(pattern).filter((part) => part !== undefined && part !== '');

  return (
    <>
      {parts.map((part, index) => {
        const key = `${index}-${part.slice(0, 8)}`;

        if (/^\[\d+(?:,\s*\d+)*\]$/.test(part)) {
          // An index the message has no reference for is dropped rather than
          // rendered as a dead chip. The server strips these too; this is the
          // second half of the same rule, so the UI cannot invent one either.
          const indices = citationIndices(part, citationCount);
          if (indices.length === 0) return null;
          return (
            <Text key={key}>
              {indices.map((value) => (
                <Text
                  key={value}
                  accessibilityRole="link"
                  accessibilityLabel={`Source ${value}`}
                  onPress={() => onCitation?.(value)}
                  style={[styles.citation, { color: theme.primary, backgroundColor: theme.surfaceVariant }]}>
                  {` ${value} `}
                </Text>
              ))}
            </Text>
          );
        }

        const link = /^\[([^\]]*)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          return (
            <Text
              key={key}
              accessibilityRole="link"
              onPress={() => void Linking.openURL(link[2]).catch(() => undefined)}
              style={{ color: theme.primary }}>
              {link[1] || link[2]}
            </Text>
          );
        }

        if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) {
          return (
            <Text key={key} style={styles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (/^`[^`]+`$/.test(part)) {
          return (
            <Text
              key={key}
              style={[styles.inlineCode, { backgroundColor: theme.surfaceVariant, color: theme.secondary }]}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (/^\*[^*\n]+\*$/.test(part)) {
          return (
            <Text key={key} style={styles.italic}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={key}>{part}</Text>;
      })}
    </>
  );
}

/** Table cells are single-line; drop the markup rather than nest a renderer. */
function stripInline(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1');
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  paragraph: {},
  h2: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  list: { gap: Spacing.two },
  listItem: { flexDirection: 'row', gap: Spacing.three, paddingRight: Spacing.two },
  bullet: { width: 18, textAlign: 'right' },
  listCopy: { flex: 1 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    borderRadius: Radius.sm,
  },
  citation: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  codeBlock: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
  codeLang: { textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 },
  code: { fontFamily: Fonts.mono, fontSize: 13, lineHeight: 19 },
  quote: { borderLeftWidth: 2, paddingLeft: Spacing.three, gap: Spacing.two },
  tableScroll: { flexGrow: 0 },
  table: { borderWidth: hairline, borderRadius: Radius.md, overflow: 'hidden' },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    minWidth: 96,
    maxWidth: 200,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rule: { height: hairline, marginVertical: Spacing.two },
});
