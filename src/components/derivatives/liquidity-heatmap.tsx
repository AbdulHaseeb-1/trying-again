import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatPrice, formatUsd, heatColor, type LiquidityMap } from '@/data/derivatives';
import { useTheme } from '@/hooks/use-theme';

/**
 * The liquidation heatmap.
 *
 * Time runs left to right, price bottom to top, and each square is lit by how
 * many dollars of leveraged positions would be liquidated there. The price line
 * is drawn over it, because the map is only interesting relative to where price
 * actually is — the bright bands it has not reached yet are the ones that would
 * feed a move.
 *
 * Every cell is one `<Rect>`, so the grid is deliberately coarse (the server
 * sums it down to roughly 60x40 before sending). At that size this is ~1,400
 * rects, which React Native's SVG renders without complaint; the full CoinGlass
 * grid is ten times that and would not.
 */
export function LiquidityHeatmap({ map, height = 240 }: { map: LiquidityMap; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const measure = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const gutter = 46;
  const plotWidth = Math.max(0, width - gutter);
  const columns = map.columns.length;
  const levels = map.levels.length;

  if (!columns || !levels) return null;

  const cellWidth = plotWidth / columns;
  const cellHeight = height / levels;
  const low = map.levels[0];
  const high = map.levels[levels - 1];
  const span = Math.max(high - low, 1);
  // Price to y, with the high end at the top like every price chart.
  const yFor = (price: number) => height - ((price - low) / span) * height;

  const line = map.candles
    .map((candle, index) => `${index === 0 ? 'M' : 'L'} ${index * cellWidth + cellWidth / 2} ${yFor(candle.close)}`)
    .join(' ');

  const marks = [high, low + span * 0.5, low];

  return (
    <View onLayout={measure} style={styles.wrap}>
      {width > 0 ? (
        <Svg
          accessibilityRole="image"
          accessibilityLabel={`Liquidation heatmap for ${map.symbol}, ${formatUsd(map.maxCell)} in the densest band`}
          width={width}
          height={height}>
          <Rect x={0} y={0} width={plotWidth} height={height} fill={theme.surfaceVariant} />
          {map.cells.map(([column, level, usd]) => (
            <Rect
              key={`${column}-${level}`}
              x={column * cellWidth}
              // Row 0 is the lowest price, so it sits at the bottom.
              y={height - (level + 1) * cellHeight}
              width={Math.max(cellWidth, 1)}
              height={Math.max(cellHeight, 1)}
              fill={heatColor(usd, map.maxCell)}
            />
          ))}
          <Path d={line} fill="none" stroke={theme.text} strokeWidth={1.4} strokeLinejoin="round" />
          {map.price !== null ? (
            <Line
              x1={0}
              y1={yFor(map.price)}
              x2={plotWidth}
              y2={yFor(map.price)}
              stroke={theme.text}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
          ) : null}
          {marks.map((price) => (
            <Line
              key={`grid-${price}`}
              x1={0}
              y1={yFor(price)}
              x2={plotWidth}
              y2={yFor(price)}
              stroke={theme.border}
              strokeWidth={1}
            />
          ))}
        </Svg>
      ) : null}

      {/* Price axis, outside the plot so it never sits on top of a hot band. */}
      {width > 0 ? (
        <View style={[styles.axis, { height, width: gutter }]} pointerEvents="none">
          {marks.map((price) => (
            <ThemedText key={`label-${price}`} type="small" themeColor="textMuted" style={styles.axisLabel}>
              {formatPrice(price)}
            </ThemedText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The colour ramp, so the picture above is readable without guessing. */
export function HeatLegend({ max }: { max: number }) {
  const steps = [0.04, 0.15, 0.35, 0.6, 1];
  return (
    <View style={styles.legend}>
      <ThemedText type="small" themeColor="textMuted">
        Less
      </ThemedText>
      <View style={styles.legendBar}>
        {steps.map((step) => (
          <View key={step} style={[styles.legendStep, { backgroundColor: heatColor(max * step, max) }]} />
        ))}
      </View>
      <ThemedText type="small" themeColor="textMuted">
        {formatUsd(max)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', borderRadius: Radius.md, overflow: 'hidden' },
  axis: {
    position: 'absolute',
    right: 0,
    top: 0,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 2,
  },
  axisLabel: { fontSize: 10, lineHeight: 13, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  legendBar: { flex: 1, flexDirection: 'row', height: 8, borderRadius: Radius.full, overflow: 'hidden' },
  legendStep: { flex: 1, height: '100%' },
});
