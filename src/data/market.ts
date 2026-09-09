export type Tone = 'positive' | 'negative' | 'neutral' | 'warning';

export type MarketAsset = {
  symbol: string;
  name: string;
  price: string;
  change: string;
  tone: Tone;
  sentiment: string;
  category: 'Crypto' | 'Indices' | 'Commodities' | 'FX';
  points: number[];
};

export const marketAssets: MarketAsset[] = [
  { symbol: 'BTC', name: 'Bitcoin', price: '$96,214', change: '+2.4%', tone: 'positive', sentiment: 'Bullish', category: 'Crypto', points: [24, 28, 23, 34, 31, 39, 36, 47, 44, 54, 58, 67] },
  { symbol: 'ETH', name: 'Ethereum', price: '$3,642', change: '+1.8%', tone: 'positive', sentiment: 'Bullish', category: 'Crypto', points: [27, 22, 29, 31, 28, 35, 39, 37, 48, 45, 52, 57] },
  { symbol: 'SOL', name: 'Solana', price: '$188.42', change: '+3.7%', tone: 'positive', sentiment: 'Momentum', category: 'Crypto', points: [18, 25, 22, 35, 31, 38, 35, 45, 49, 56, 51, 64] },
  { symbol: 'Gold', name: 'Gold Spot', price: '$3,589', change: '+0.6%', tone: 'positive', sentiment: 'Neutral', category: 'Commodities', points: [40, 42, 39, 44, 46, 43, 49, 50, 47, 52, 54, 57] },
  { symbol: 'DXY', name: 'US Dollar Index', price: '98.12', change: '-0.7%', tone: 'negative', sentiment: 'Bearish', category: 'FX', points: [61, 58, 62, 54, 51, 48, 50, 43, 39, 41, 34, 30] },
  { symbol: 'SPX', name: 'S&P 500', price: '6,382', change: '+0.3%', tone: 'positive', sentiment: 'Constructive', category: 'Indices', points: [36, 33, 38, 37, 40, 44, 42, 46, 45, 49, 51, 53] },
  { symbol: 'NDX', name: 'Nasdaq 100', price: '23,884', change: '+0.5%', tone: 'positive', sentiment: 'Constructive', category: 'Indices', points: [30, 34, 32, 39, 37, 43, 42, 48, 45, 51, 53, 58] },
];

export const tickerAssets = marketAssets.filter((asset) => ['BTC', 'ETH', 'Gold', 'DXY'].includes(asset.symbol));

/**
 * Retained for the AI panel's story-analysis flow, which is wired for news
 * items even though the calendar replaced the mock news feed.
 */
export type NewsItem = {
  id: string;
  time: string;
  category: string;
  headline: string;
  assets: string[];
  impact: string;
  tone: Tone;
};

export const derivativeMetrics = [
  { label: 'Open Interest', value: '$34.2B', change: '+4.8%', tone: 'positive' as Tone },
  { label: 'Funding', value: '0.010%', change: 'Balanced', tone: 'positive' as Tone },
  { label: 'Long / Short', value: '52% / 48%', change: 'Longs higher', tone: 'neutral' as Tone },
  { label: 'Liquidations', value: '$48.7M', change: '24H', tone: 'warning' as Tone },
];

export const alertSeed = [
  { id: 'a1', icon: 'chart', title: 'BTC OI Spike', detail: 'Open interest increased 12% within 1 hour.', time: '8m ago', active: true },
  { id: 'a2', icon: 'percent', title: 'Funding Extreme', detail: 'BTC funding exceeded the historical threshold.', time: '46m ago', active: true },
  { id: 'a3', icon: 'calendar', title: 'Macro Event', detail: 'US CPI releases in 30 minutes.', time: '1h ago', active: true },
  { id: 'a4', icon: 'bell', title: 'Price Alert', detail: 'BTC crossed $95,000.', time: 'Yesterday', active: false },
];

export const detailSeries = [31, 28, 36, 33, 41, 38, 46, 43, 51, 49, 58, 54, 61, 64, 59, 68, 71, 76, 73, 82];
