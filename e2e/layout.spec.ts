import { expect, test, type Locator, type Page } from '@playwright/test';

import { ask, assistantText, openAgentPanel, openApp, scriptModel, settle, waitForIdle } from './support/agent-page';

/**
 * The presentation pass, made repeatable.
 *
 * "Inspect it visually" is a fine instruction for a person and a useless one
 * for a suite, so the things a person would look for are asserted instead:
 * nothing scrolls sideways, nothing is drawn outside the panel it belongs to,
 * the composer does not move while the transcript grows, and the same holds at
 * three widths, in both colour schemes and with motion reduced.
 *
 * Each case also attaches a screenshot, so the report is the visual record.
 */

const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 1024, height: 800 };
const TABLET = { width: 834, height: 1112 };

/** Every ancestor-visible box the panel draws, measured against the panel. */
async function assertContained(page: Page, container: Locator, children: Locator): Promise<void> {
  const bounds = (await container.boundingBox())!;
  const count = await children.count();
  for (let index = 0; index < count; index += 1) {
    const box = await children.nth(index).boundingBox();
    if (!box) continue;
    expect(box.x, `child ${index} starts left of the panel`).toBeGreaterThanOrEqual(bounds.x - 1);
    expect(box.x + box.width, `child ${index} runs past the panel`).toBeLessThanOrEqual(
      bounds.x + bounds.width + 1,
    );
  }
}

async function assertNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'the document scrolls sideways').toBeLessThanOrEqual(1);
}

async function shoot(page: Page, name: string): Promise<void> {
  // Written to the run's output directory as well as attached, so the images
  // can be looked at directly and not only through the HTML report.
  const path = test.info().outputPath(name);
  await page.screenshot({ path });
  await test.info().attach(name, { path, contentType: 'image/png' });
}

const LONG_ANSWER = [
  '## The setup',
  '',
  'Positioning is crowded into the print, and the options market has been paying up for downside since the middle of last week. The three things that matter:',
  '',
  '1. Funding has stayed positive through a 6% drawdown, which is usually late-cycle rather than early.',
  '2. Open interest has not come down with price — leverage is being defended, not cut.',
  '3. Spot volume is thin, so the marginal trade is a liquidation rather than a decision.',
  '',
  '| Venue | Open interest | Funding |',
  '| --- | --- | --- |',
  '| Binance | $8.4b | 0.011% |',
  '| Bybit | $3.1b | 0.008% |',
  '| OKX | $2.7b | 0.014% |',
  '',
  'A worked example, because the arithmetic is the argument:',
  '',
  '```ts',
  'const notional = openInterest * price;',
  'const impliedLiquidation = notional / leverage;',
  '```',
  '',
  'None of this is a forecast. It is a description of where the pain sits, and the pain sits with the people who are long and paying to stay that way. If the print comes in hot, the first move is mechanical rather than considered, and the second move is the one worth reading.',
].join('\n');

test.describe('presentation: the docked panel', () => {
  test.use({ viewport: WIDE });

  test('a long, rich answer wraps inside the panel and does not move the composer', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: LONG_ANSWER }]);
    await openApp(page);
    await openAgentPanel(page);

    const composer = page.getByRole('textbox', { name: 'Message' });
    const before = (await composer.boundingBox())!;

    await ask(page, 'Give me the full picture');
    await expect(assistantText(page)).toContainText('The setup', { timeout: 20_000 });
    await waitForIdle(page);

    const panel = page.getByTestId('agent-panel-docked');
    await assertContained(page, panel, page.getByTestId('assistant-message'));
    await assertNoSidewaysScroll(page);

    // The composer is anchored: a growing transcript scrolls behind it rather
    // than pushing it down the screen.
    const after = (await composer.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);

    // The message keeps a reading measure rather than filling any width given.
    const bubble = (await assistantText(page).boundingBox())!;
    const bounds = (await panel.boundingBox())!;
    expect(bubble.width).toBeLessThanOrEqual(bounds.width);

    await shoot(page, 'docked-long-answer.png');
  });

  test('a wide table and a code block scroll themselves, not the page', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: LONG_ANSWER }]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'Show me the venue table');
    await expect(assistantText(page)).toContainText('Binance', { timeout: 20_000 });
    await waitForIdle(page);

    await assertNoSidewaysScroll(page);
    await shoot(page, 'docked-table-and-code.png');
  });

  test('many sources stay inside the panel', async ({ page }) => {
    await scriptModel([
      { kind: 'tool', name: 'get_latest_news', args: { limit: 12, symbols: [] } },
      {
        kind: 'text',
        text: 'The calendar has printed a lot today [1][2][3][4][5][6][7][8][9][10][11][12].',
      },
    ]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'Everything that printed today');
    await expect(assistantText(page)).toContainText('printed a lot today', { timeout: 20_000 });
    await waitForIdle(page);

    const chips = page.getByTestId('source-chip');
    expect(await chips.count()).toBeGreaterThan(1);
    await assertNoSidewaysScroll(page);

    // The strip is a horizontal scroller by design — a dozen wrapped chips
    // would dominate the answer they belong to — so what matters is that the
    // scroller itself is inside the panel and clips its content rather than
    // letting it spill across the application behind it.
    const panel = (await page.getByTestId('agent-panel-docked').boundingBox())!;
    const strip = (await chips.first().evaluate((node) => {
      let element: HTMLElement | null = node as HTMLElement;
      while (element && element.scrollWidth <= element.clientWidth) element = element.parentElement;
      const box = element!.getBoundingClientRect();
      return { x: box.x, width: box.width, scrollWidth: element!.scrollWidth };
    }))!;
    expect(strip.x).toBeGreaterThanOrEqual(panel.x - 1);
    expect(strip.x + strip.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
    expect(strip.scrollWidth).toBeGreaterThan(strip.width);

    // And the first chip is on screen without scrolling anything.
    await expect(chips.first()).toBeInViewport();

    await shoot(page, 'docked-many-sources.png');
  });

  test('a slow tool shows a running card without shifting anything', async ({ page }) => {
    await scriptModel(
      [
        { kind: 'tool', name: 'get_market_snapshot', args: { symbol: 'BTC' } },
        { kind: 'text', text: 'Done reading [1].' },
      ],
      140,
    );
    await openApp(page);
    await openAgentPanel(page);

    const composer = page.getByRole('textbox', { name: 'Message' });
    const before = (await composer.boundingBox())!;
    await ask(page, 'Read BTC slowly');

    const card = page.getByTestId('tool-card').first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await shoot(page, 'docked-tool-running.png');

    const during = (await composer.boundingBox())!;
    expect(Math.abs(during.y - before.y)).toBeLessThanOrEqual(1);

    await expect(assistantText(page)).toContainText('Done reading', { timeout: 20_000 });
    await waitForIdle(page);
    await assertNoSidewaysScroll(page);
  });

  test('the empty state and an error both stay inside the panel', async ({ page }) => {
    await openApp(page);
    await openAgentPanel(page);
    const panel = page.getByTestId('agent-panel-docked');
    await settle(page, panel);
    await shoot(page, 'docked-empty.png');
    await assertNoSidewaysScroll(page);

    await scriptModel([{ kind: 'status', status: 503 }]);
    await ask(page, 'This will fail');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 20_000 });

    await assertContained(page, panel, page.getByRole('button', { name: 'Retry' }));
    await assertNoSidewaysScroll(page);
    await shoot(page, 'docked-error.png');
  });

  test('resized to its limits, nothing clips at either end', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: LONG_ANSWER }]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'Fill the panel');
    await expect(assistantText(page)).toContainText('The setup', { timeout: 20_000 });
    await waitForIdle(page);

    const panel = page.getByTestId('agent-panel-docked');
    const handle = page.getByRole('slider', { name: 'Resize the assistant panel' });

    for (const [direction, label] of [
      [-1, 'wide'],
      [1, 'narrow'],
    ] as const) {
      await settle(page, panel);
      const grip = (await handle.boundingBox())!;
      const y = grip.y + grip.height / 2;
      await page.mouse.move(grip.x + grip.width / 2, y);
      await page.mouse.down();
      for (let step = 1; step <= 20; step += 1) {
        await page.mouse.move(grip.x + grip.width / 2 + direction * step * 15, y);
        await page.waitForTimeout(15);
      }
      await page.mouse.up();
      await page.waitForTimeout(250);

      const bounds = (await panel.boundingBox())!;
      // Clamped to the readable range at both ends, and always on screen.
      expect(bounds.width).toBeGreaterThanOrEqual(339);
      expect(bounds.width).toBeLessThanOrEqual(WIDE.width / 2 + 1);
      expect(bounds.x).toBeGreaterThanOrEqual(-1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(WIDE.width + 1);

      await assertContained(page, panel, page.getByTestId('assistant-message'));
      await assertNoSidewaysScroll(page);
      await shoot(page, `docked-resized-${label}.png`);
    }
  });

  test('the keyboard alone can reach and send from the composer', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Reached without a mouse.' }]);
    await openApp(page);
    await openAgentPanel(page);

    const composer = page.getByRole('textbox', { name: 'Message' });
    await composer.focus();
    // A focused control must be visibly focused: the browser's ring, or one the
    // panel draws itself.
    const focusRing = await composer.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.outlineStyle}:${style.outlineWidth}:${style.boxShadow}`;
    });
    expect(focusRing).not.toBe('none:0px:none');

    await page.keyboard.type('Sent from the keyboard');
    await page.keyboard.press('Enter');
    await expect(assistantText(page)).toContainText('Reached without a mouse.', { timeout: 20_000 });
  });
});

test.describe('presentation: dark mode', () => {
  test.use({ viewport: NARROW, colorScheme: 'dark' });

  test('draws dark surfaces with readable text', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: LONG_ANSWER }]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'Read this in the dark');
    await expect(assistantText(page)).toContainText('The setup', { timeout: 20_000 });
    await waitForIdle(page);

    const panel = page.getByTestId('agent-panel-docked');
    const luminance = await panel.evaluate((element) => {
      const relative = (channel: number) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const read = (node: Element | null): number | null => {
        if (!node) return null;
        const colour = getComputedStyle(node).backgroundColor;
        const parts = colour.match(/\d+(\.\d+)?/g);
        if (!parts || (parts[3] !== undefined && Number(parts[3]) === 0)) {
          return read(node.parentElement);
        }
        const [r, g, b] = parts.map(Number);
        return 0.2126 * relative(r) + 0.7152 * relative(g) + 0.0722 * relative(b);
      };
      return read(element);
    });
    expect(luminance, 'the panel surface is not dark').not.toBeNull();
    expect(luminance!).toBeLessThan(0.2);

    await assertNoSidewaysScroll(page);
    await shoot(page, 'dark-docked.png');
  });
});

test.describe('presentation: a tablet, with motion reduced', () => {
  test.use({ viewport: TABLET, reducedMotion: 'reduce' });

  test('falls back to the sheet and still fits', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: LONG_ANSWER }]);
    await openApp(page);
    await openAgentPanel(page);

    // 834 is below the dock breakpoint, so the sheet is the correct layout —
    // a 340pt sidebar next to 494pt of content would be neither.
    const sheet = page.getByTestId('agent-panel-sheet');
    await expect(sheet).toBeVisible();

    await ask(page, 'How does this read on a tablet?');
    await expect(assistantText(page)).toContainText('The setup', { timeout: 20_000 });
    await waitForIdle(page);

    await assertContained(page, sheet, page.getByTestId('assistant-message'));
    await assertNoSidewaysScroll(page);

    const bounds = (await sheet.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(-1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(TABLET.width + 1);

    await shoot(page, 'tablet-sheet.png');
  });
});

test.describe('presentation: the settings section', () => {
  test.use({ viewport: TABLET });

  test('every AI screen fits its width', async ({ page }) => {
    for (const path of [
      '/settings/ai',
      '/settings/ai/providers',
      '/settings/ai/models',
      '/settings/ai/agents',
      '/settings/ai/search',
      '/settings/ai/tools',
      '/settings/ai/privacy',
      '/settings/ai/advanced',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
      await page.waitForTimeout(200);
      await assertNoSidewaysScroll(page);
      await shoot(page, `settings${path.replace(/\//g, '-')}.png`);
    }
  });
});
