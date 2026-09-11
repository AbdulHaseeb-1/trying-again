import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The vocabulary the specs are written in.
 *
 * Every selector here is an accessibility label or role that the application
 * genuinely exposes — which means these helpers double as a check that the
 * panel is operable by a screen reader and by a keyboard, not only by a mouse.
 */

const CONTROL = `http://127.0.0.1:${process.env.E2E_CONTROL_PORT ?? 4023}`;

export type Turn =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; args: Record<string, unknown> }
  | { kind: 'status'; status: number; body?: string };

/** Script what the model will say for the next run. */
export async function scriptModel(turns: Turn[], chunkDelayMs = 0): Promise<void> {
  const response = await fetch(`${CONTROL}/__e2e/turns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ turns, chunkDelayMs }),
  });
  if (!response.ok) throw new Error(`could not script the model: ${response.status}`);
}

export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  // The floating assistant button is the last thing a tab screen mounts, so its
  // presence is a reliable "the app is up" signal.
  await expect(page.getByRole('button', { name: 'Open MarketPulse AI' })).toBeVisible();
}

/**
 * Settings screens are pushed routes with no tab bar, so they need their own
 * readiness signal: the back control every one of them renders.
 */
export async function openSettings(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
}

export async function openAgentPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open MarketPulse AI' }).click();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await settle(page, page.getByRole('textbox', { name: 'Message' }));
}

/**
 * Wait for an element to stop moving.
 *
 * The panel slides in, and a coordinate measured mid-animation is stale by the
 * time a drag starts — which is the difference between dragging the resize
 * handle and pressing somewhere in the transcript.
 */
export async function settle(page: Page, locator: Locator): Promise<void> {
  let previous = await locator.boundingBox();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(60);
    const next = await locator.boundingBox();
    if (previous && next && Math.abs(previous.x - next.x) < 0.5 && Math.abs(previous.y - next.y) < 0.5) {
      return;
    }
    previous = next;
  }
}

export async function ask(page: Page, message: string): Promise<void> {
  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.click();
  await composer.fill(message);
  await page.getByRole('button', { name: 'Send message' }).click();
}

export function assistantText(page: Page) {
  return page.getByTestId('assistant-message').last();
}

/** Wait for the send button to come back, which is how the panel says "done". */
export async function waitForIdle(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible({ timeout: 30_000 });
}
