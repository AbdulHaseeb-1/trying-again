import { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Rect, Stop, Text } from 'react-native-svg';

/**
 * Hand-drawn marks for the majors, a monogram for everything else.
 *
 * The service returns every coin with a futures market — roughly a thousand of
 * them — so a fixed set of drawings will always run out. It used to render an
 * empty box for anything it did not know, which read as a broken image; a
 * deterministic monogram is honest and never blank.
 */
export function AssetIcon({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const id = `asset-${useId().replace(/:/g, '')}`;
  const key = symbol.toUpperCase();
  const drawn = DRAWN.has(key);

  return (
    <Svg accessibilityRole="image" accessibilityLabel={`${symbol} icon`} width={size} height={size} viewBox="0 0 40 40">
      {key === 'BTC' ? <><Circle cx="20" cy="20" r="18" fill="#F7931A" /><Text x="20" y="27" fill="#FFF" fontSize="22" fontWeight="700" textAnchor="middle">₿</Text></> : null}
      {key === 'ETH' ? <><Polygon points="20,2 9,21 20,16 31,21" fill="#8C8CFF" /><Polygon points="20,16 9,21 20,38 31,21" fill="#627EEA" /></> : null}
      {key === 'SOL' ? <><Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#00FFA3" /><Stop offset="1" stopColor="#DC1FFF" /></LinearGradient></Defs><Path d="M8 8h25l-5 6H3l5-6Zm-5 9h25l5 6H8l-5-6Zm5 9h25l-5 6H3l5-6Z" fill={`url(#${id})`} /></> : null}
      {key === 'GOLD' || key === 'XAU' ? <><Polygon points="8,13 30,13 36,28 3,28" fill="#DCA72C" /><Polygon points="8,13 16,7 29,7 30,13" fill="#FFD76A" /><Path d="M11 18h17" stroke="#FFF1A8" strokeWidth="2" strokeLinecap="round" /></> : null}
      {key === 'DXY' ? <><Circle cx="20" cy="20" r="17" fill="none" stroke="#66D19E" strokeWidth="2" /><Text x="20" y="27" fill="#66D19E" fontSize="22" fontWeight="700" textAnchor="middle">$</Text></> : null}
      {key === 'SPX' ? <><Circle cx="20" cy="20" r="17" fill="#1769AA" /><Path d="M8 27l7-8 6 4 10-12M26 11h5v5" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></> : null}
      {key === 'NDX' ? <><Rect x="3" y="3" width="34" height="34" rx="10" fill="#6D4AFF" /><Path d="M10 29V11l20 18V11" fill="none" stroke="#FFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></> : null}
      {drawn ? null : (
        <>
          <Circle cx="20" cy="20" r="18" fill={monogramColor(key)} />
          <Text
            x="20"
            y={key.length > 3 ? 25 : 26}
            fill="#0B0B0C"
            fontSize={key.length > 3 ? 13 : 16}
            fontWeight="700"
            textAnchor="middle">
            {key.slice(0, 4)}
          </Text>
        </>
      )}
    </Svg>
  );
}

const DRAWN = new Set(['BTC', 'ETH', 'SOL', 'GOLD', 'XAU', 'DXY', 'SPX', 'NDX']);

/** Stable colour per ticker, so a coin looks the same everywhere it appears. */
function monogramColor(symbol: string): string {
  let hash = 0;
  for (let index = 0; index < symbol.length; index += 1) {
    hash = (hash * 31 + symbol.charCodeAt(index)) % 360;
  }
  return `hsl(${hash}, 62%, 62%)`;
}
