/** The four ways a number can read. Shared by every surface that colours one. */
export type Tone = 'positive' | 'negative' | 'neutral' | 'warning';

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

export const alertSeed = [
  { id: 'a1', icon: 'chart', title: 'BTC OI Spike', detail: 'Open interest increased 12% within 1 hour.', time: '8m ago', active: true },
  { id: 'a2', icon: 'percent', title: 'Funding Extreme', detail: 'BTC funding exceeded the historical threshold.', time: '46m ago', active: true },
  { id: 'a3', icon: 'calendar', title: 'Macro Event', detail: 'US CPI releases in 30 minutes.', time: '1h ago', active: true },
  { id: 'a4', icon: 'bell', title: 'Price Alert', detail: 'BTC crossed $95,000.', time: 'Yesterday', active: false },
];

