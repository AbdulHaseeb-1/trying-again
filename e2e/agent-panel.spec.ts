import { expect, test } from '@playwright/test';

import {
  ask,
  assistantText,
  openAgentPanel,
  openApp,
  scriptModel,
  settle,
  waitForIdle,
} from './support/agent-page';

/**
 * The Agent Panel, driven as a user drives it.
 *
 * Every assertion here goes through the real application: the exported web
 * build talking to the compiled service. The only thing standing in is the
 * model's wire, scripted per test so the assertions can be exact.
 */

test.describe('agent panel', () => {
  test('opens, streams an answer, and stays interactive', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Open interest is building into the CPI print.' }]);
    await openApp(page);
    await openAgentPanel(page);

    // The empty state names the agent and offers something to tap.
    await expect(page.getByText('Market Assistant').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'What is driving the market right now?' })).toBeVisible();

    await ask(page, 'What is happening?');

    await expect(page.getByTestId('user-message')).toContainText('What is happening?');
    await expect(assistantText(page)).toContainText('Open interest is building into the CPI print.', {
      timeout: 20_000,
    });
    await waitForIdle(page);
  });

  test('starts a conversation from a suggested prompt', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Nothing much is moving.' }]);
    await openApp(page);
    await openAgentPanel(page);

    await page.getByRole('button', { name: 'What is driving the market right now?' }).click();
    await expect(assistantText(page)).toContainText('Nothing much is moving.', { timeout: 20_000 });
  });

  test('sends with the keyboard', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Sent with a keystroke.' }]);
    await openApp(page);
    await openAgentPanel(page);

    const composer = page.getByRole('textbox', { name: 'Message' });
    await composer.click();
    await composer.fill('Use the keyboard');
    // Enter sends; Shift+Enter would break the line.
    await composer.press('Enter');

    await expect(assistantText(page)).toContainText('Sent with a keystroke.', { timeout: 20_000 });
  });

  test('stops a run and keeps what was already written', async ({ page }) => {
    await scriptModel(
      [{ kind: 'text', text: 'one two three four five six seven eight nine ten eleven twelve' }],
      120,
    );
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'count slowly');

    // While streaming, the primary button becomes Stop.
    const stop = page.getByRole('button', { name: 'Stop generating' });
    await expect(stop).toBeVisible({ timeout: 20_000 });
    await expect(assistantText(page)).toContainText('one two', { timeout: 20_000 });

    await stop.click();

    // The composer comes straight back — the interface does not wait on the
    // server to become usable again.
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
    await expect(assistantText(page)).not.toContainText('twelve');
  });

  test('shows a tool card and lets it be inspected', async ({ page }) => {
    await scriptModel([
      { kind: 'tool', name: 'get_market_snapshot', args: { symbol: 'BTC' } },
      { kind: 'text', text: 'BTC is where the data says it is [1].' },
    ]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'Read BTC');

    const card = page.getByTestId('tool-card').first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    // The collapsed card is a sentence, not a payload.
    await expect(card).toContainText('Reading BTC market data');
    await expect(card).not.toContainText('{');

    await card.getByRole('button').first().click();
    await expect(card).toContainText('get_market_snapshot');
    await expect(card).toContainText('Duration');
  });

  test('cites application news and opens the source', async ({ page }) => {
    await scriptModel([
      { kind: 'tool', name: 'get_latest_news', args: { limit: 3, symbols: [] } },
      { kind: 'text', text: 'The calendar has printed several releases [1].' },
    ]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'What is the latest news?');

    await expect(assistantText(page)).toContainText('printed several releases', { timeout: 20_000 });

    const chip = page.getByTestId('source-chip').first();
    await expect(chip).toBeVisible();
    // The chip carries the headline: several releases from the same publisher
    // would otherwise be several identical chips.
    await expect(chip).toContainText('1');
    const headline = (await chip.innerText()).replace(/^1\s*/, '').trim();
    expect(headline.length).toBeGreaterThan(0);
    expect(headline).not.toBe('MarketPulse Calendar');

    await chip.click();

    // The source sheet resolves the internal id to the stored article, and
    // names the publisher the chip had no room for.
    await expect(page.getByText('Source', { exact: true })).toBeVisible();
    await expect(page.getByText('MarketPulse Calendar').first()).toBeVisible();
    await expect(page.getByText('Importance')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the original source' }).or(page.getByText('Captured'))).toBeVisible();
  });

  test('never renders a citation the answer has no source for', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Inflation is cooling [3], say analysts.' }]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'Is inflation cooling?');

    await expect(assistantText(page)).toContainText('Inflation is cooling', { timeout: 20_000 });
    // No tool ran, so there is no third source — and no marker survives.
    await expect(assistantText(page)).not.toContainText('[3]');
    await expect(page.getByTestId('source-chip')).toHaveCount(0);
  });

  test('switches agent and the starters change with it', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Reporting from the news desk.' }]);
    await openApp(page);
    await openAgentPanel(page);

    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: /News Research/ }).click();

    await expect(page.getByRole('button', { name: 'What moved the market today?' })).toBeVisible();

    await ask(page, 'What happened?');
    await expect(assistantText(page)).toContainText('Reporting from the news desk.', {
      timeout: 20_000,
    });
  });

  test('keeps the conversation across a reload', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'This should survive a refresh.' }]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'Remember this exchange');
    await expect(assistantText(page)).toContainText('survive a refresh', { timeout: 20_000 });

    await page.reload();
    await openApp(page);
    await openAgentPanel(page);

    await page.getByRole('button', { name: 'Conversation history' }).click();
    const row = page.getByTestId('conversation-row').first();
    await expect(row).toContainText('Remember this exchange');
    await row.click();

    await expect(page.getByTestId('user-message').first()).toContainText('Remember this exchange');
    await expect(assistantText(page)).toContainText('survive a refresh');
  });

  test('renames and deletes a conversation', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Housekeeping.' }]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'A conversation to tidy up');
    await expect(assistantText(page)).toContainText('Housekeeping.', { timeout: 20_000 });

    await page.getByRole('button', { name: 'Conversation history' }).click();
    await expect(page.getByTestId('conversation-row').first()).toContainText(
      'A conversation to tidy up',
    );
    await page.getByRole('button', { name: /^Options for A conversation to tidy up$/ }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();

    const title = page.getByRole('textbox', { name: 'Conversation title' });
    await title.fill('Tidied');
    await page.getByRole('button', { name: 'Save title' }).click();

    // Saving returns to the list it was opened from, so it is already up.
    await expect(page.getByTestId('conversation-row').first()).toContainText('Tidied');

    await page.getByRole('button', { name: /^Options for Tidied$/ }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    await expect(page.getByTestId('conversation-row').filter({ hasText: 'Tidied' })).toHaveCount(0);
  });

  test('reports a provider failure with a retry', async ({ page }) => {
    await scriptModel([{ kind: 'status', status: 503 }]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'This will fail');

    await expect(page.getByText(/could not be reached|Something went wrong/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    // Retrying with a working model recovers without a reload.
    await scriptModel([{ kind: 'text', text: 'Recovered on the second attempt.' }]);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(assistantText(page)).toContainText('Recovered on the second attempt.', {
      timeout: 20_000,
    });
  });

  test('attaches the chart the user is looking at', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Noted the attachment.' }]);
    await openApp(page, '/derivatives');
    await openAgentPanel(page);

    await page.getByRole('button', { name: 'Add context' }).click();
    // The suggestion follows the screen: the derivatives tab reports its symbol.
    const chart = page.getByRole('menuitem').filter({ hasText: 'chart' }).first();
    await chart.click();

    await ask(page, 'What about this?');
    await expect(page.getByTestId('user-message').first()).toContainText('What about this?');
    await expect(assistantText(page)).toContainText('Noted the attachment.', { timeout: 20_000 });
  });

  test('the docked panel resizes and collapses', async ({ page }) => {
    await openApp(page);
    await openAgentPanel(page);

    const panel = page.getByTestId('agent-panel-docked');
    await expect(panel).toBeVisible();
    await settle(page, panel);
    const before = (await panel.boundingBox())!;

    const handle = page.getByRole('slider', { name: 'Resize the assistant panel' });
    const grip = (await handle.boundingBox())!;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(grip.x + grip.width / 2, y);
    await page.mouse.down();
    // Incremental moves with a beat between them: the gesture recogniser tracks
    // pointer events, and a single jump is one event it reads as a tap.
    for (let step = 1; step <= 12; step += 1) {
      await page.mouse.move(grip.x + grip.width / 2 - step * 10, y);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = (await panel.boundingBox())!;
    expect(after.width).toBeGreaterThan(before.width + 40);

    await page.getByRole('button', { name: 'Collapse the assistant' }).click();
    await expect(panel).toHaveCount(0);
  });
});
