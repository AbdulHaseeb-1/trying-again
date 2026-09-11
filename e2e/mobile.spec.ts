import { expect, test } from '@playwright/test';

import { ask, assistantText, openAgentPanel, openApp, scriptModel, waitForIdle } from './support/agent-page';

/**
 * The phone experience.
 *
 * Not "the desktop panel, narrower". At this width the assistant is a sheet
 * with a grabber and a bottom composer, and these tests assert the properties
 * that make it usable with one hand: it fills the screen, the composer sits
 * above the safe area, and every control clears a comfortable touch target.
 */

test.describe('agent panel on a phone', () => {
  test('opens as a sheet rather than a sidebar', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Answering on a phone.' }]);
    await openApp(page);
    await openAgentPanel(page);

    await expect(page.getByTestId('agent-panel-sheet')).toBeVisible();
    await expect(page.getByTestId('agent-panel-docked')).toHaveCount(0);

    const sheet = (await page.getByTestId('agent-panel-sheet').boundingBox())!;
    const viewport = page.viewportSize()!;
    // A sheet, not a dialog: full width, and most of the height.
    expect(sheet.width).toBeGreaterThan(viewport.width - 4);
    expect(sheet.height).toBeGreaterThan(viewport.height * 0.7);
  });

  test('streams an answer with the composer reachable at the bottom', async ({ page }) => {
    await scriptModel([{ kind: 'text', text: 'Short answer for a small screen.' }]);
    await openApp(page);
    await openAgentPanel(page);

    const composer = page.getByRole('textbox', { name: 'Message' });
    const box = (await composer.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThan(viewport.height * 0.6);

    await ask(page, 'Keep it short');
    await expect(assistantText(page)).toContainText('Short answer for a small screen.', {
      timeout: 20_000,
    });
    await waitForIdle(page);
  });

  test('gives every control a comfortable touch target', async ({ page }) => {
    await openApp(page);
    await openAgentPanel(page);

    for (const name of [
      'New conversation',
      'Conversation history',
      'More options',
      'Close assistant',
      'Add context',
      'Send message',
    ]) {
      const control = page.getByRole('button', { name }).first();
      const box = (await control.boundingBox())!;
      // 32pt drawn plus hit slop; the drawn box must not itself be tiny.
      expect(box.width, `${name} width`).toBeGreaterThanOrEqual(28);
      expect(box.height, `${name} height`).toBeGreaterThanOrEqual(28);
    }
  });

  test('does not scroll sideways at phone width', async ({ page }) => {
    await scriptModel([
      {
        kind: 'text',
        text: 'A deliberately long paragraph that has to wrap rather than push the layout sideways, because a horizontally scrolling chat is the clearest sign that a desktop panel was squeezed into a phone without being redesigned for it.',
      },
    ]);
    await openApp(page);
    await openAgentPanel(page);
    await ask(page, 'Say something long');
    await expect(assistantText(page)).toContainText('wrap rather than push', { timeout: 20_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('closes from the sheet and reopens with the draft intact', async ({ page }) => {
    await openApp(page);
    await openAgentPanel(page);

    const composer = page.getByRole('textbox', { name: 'Message' });
    await composer.fill('A half-written question');

    await page.getByRole('button', { name: 'Close assistant' }).click();
    await expect(page.getByTestId('agent-panel-sheet')).toHaveCount(0);

    await openAgentPanel(page);
    // The draft lives in the store, so closing the sheet does not lose it.
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'A half-written question',
    );
  });

  test('reaches AI settings from the panel menu', async ({ page }) => {
    await openApp(page);
    await openAgentPanel(page);

    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'AI & Agents settings' }).click();

    await expect(page.getByRole('button', { name: 'Providers' })).toBeVisible({ timeout: 20_000 });
  });
});
