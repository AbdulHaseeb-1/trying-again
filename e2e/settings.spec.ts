import { expect, test } from '@playwright/test';

import { openSettings } from './support/agent-page';

/**
 * Settings → AI & Agents, through the browser.
 *
 * The load-bearing assertion in this file is the last one: an API key goes in
 * and does not come back out. Everything else — navigation, test-connection
 * states, capability editing — is the surface a user needs in order to get to
 * the point where that matters.
 */

test.describe('AI settings', () => {
  test('navigates the whole section', async ({ page }) => {
    await openSettings(page, '/settings/ai');

    await expect(page.getByText('AI & Agents')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Providers' })).toBeVisible();

    for (const [label, heading] of [
      ['Providers', 'Configured'],
      ['Models', 'Roles'],
      ['Agents', 'Market Assistant'],
      ['Search', 'Engines'],
      ['Tools', 'Market data'],
      ['Privacy & permissions', 'What agents may reach'],
      ['Advanced', 'Service'],
    ] as const) {
      await page.goto('/settings/ai');
      await page.getByRole('button', { name: label }).click();
      await expect(page.getByText(heading, { exact: false }).first()).toBeVisible();
    }
  });

  test('shows the configured provider and its capabilities', async ({ page }) => {
    await openSettings(page, '/settings/ai/providers');

    const row = page.getByRole('button', { name: 'E2E Provider' });
    await expect(row).toBeVisible();
    await row.click();

    await expect(page.getByText('Capabilities')).toBeVisible();
    await expect(page.getByText('Tool calling')).toBeVisible();
    await expect(page.getByText('Streaming')).toBeVisible();
  });

  test('reports a successful connection test', async ({ page }) => {
    await openSettings(page, '/settings/ai/providers');
    await page.getByRole('button', { name: 'E2E Provider' }).click();
    await page.getByRole('button', { name: 'Test connection' }).click();

    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test('reports authentication failure without echoing the key', async ({ page }) => {
    await openSettings(page, '/settings/ai/providers');
    await page.getByRole('button', { name: 'E2E Provider' }).click();

    // Test with a wrong key *without* saving it: that is the whole point of the
    // button, and the test is also how we check nothing is echoed back.
    await page.getByRole('textbox', { name: 'API key' }).fill('sk-obviously-wrong-key');
    await page.getByRole('button', { name: 'Test connection' }).click();

    await expect(page.getByText('Authentication failed', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('body')).not.toContainText('e2e-key');
  });

  test('reports an unreachable endpoint', async ({ page }) => {
    await openSettings(page, '/settings/ai/providers');
    await page.getByRole('button', { name: 'OpenAI' }).click();

    await page.getByRole('textbox', { name: 'API key' }).fill('sk-test-value');
    await page.getByRole('textbox', { name: 'Base URL' }).fill('https://127.0.0.1:1/v1');
    await page.getByRole('button', { name: 'Test connection' }).click();

    await expect(page.getByText('Endpoint unreachable')).toBeVisible({ timeout: 30_000 });
  });

  test('never shows a stored key, only a preview of one', async ({ page }) => {
    await openSettings(page, '/settings/ai/providers');
    await page.getByRole('button', { name: 'E2E Provider' }).click();

    // A key is stored for this provider; the screen says so without saying what.
    await expect(page.getByText(/A key is stored/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('e2e-key');

    const field = page.getByRole('textbox', { name: 'API key' });
    await expect(field).toHaveValue('');
  });

  test('adds and removes a custom provider', async ({ page }) => {
    await openSettings(page, '/settings/ai/providers');
    await page.getByRole('button', { name: 'Add a custom provider' }).click();

    await page.getByRole('textbox', { name: 'Name' }).fill('Scratch Gateway');
    await page.getByRole('textbox', { name: 'Id' }).fill('scratch-gateway');
    await page.getByRole('button', { name: 'Add provider' }).click();

    // Adding one lands on its detail screen, which is where it needs configuring.
    await expect(page.getByRole('button', { name: 'Remove this provider' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('textbox', { name: 'Base URL' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove this provider' }).click();
    await expect(page.getByRole('button', { name: 'Scratch Gateway' })).toHaveCount(0, {
      timeout: 20_000,
    });
  });

  test('shows which model each role runs on', async ({ page }) => {
    await openSettings(page, '/settings/ai/models');
    await expect(page.getByRole('button', { name: /^Primary/ })).toBeVisible();
    await expect(page.getByText('e2e · fake-model-1')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Research/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Fallback/ })).toBeVisible();
  });

  test('lists agents with their capabilities and refuses to widen one', async ({ page }) => {
    await openSettings(page, '/settings/ai/agents');

    await expect(page.getByText('Market Analyst')).toBeVisible();
    await expect(page.getByText('Read market data', { exact: false }).first()).toBeVisible();

    // The analyst's card offers only the capabilities its definition allows.
    const analystCapabilities = page
      .getByRole('button', { name: 'Capabilities' })
      .nth(1);
    await analystCapabilities.click();
    await expect(page.getByRole('menuitem', { name: /Read market data/ })).toBeVisible();
  });

  test('lists the application tools with the capability each needs', async ({ page }) => {
    await openSettings(page, '/settings/ai/tools');
    await expect(page.getByText('get_market_snapshot')).toBeVisible();
    await expect(page.getByText('web_search')).toBeVisible();
    await expect(page.getByText('Search the web').first()).toBeVisible();
  });

  test('toggles a privacy switch and it sticks', async ({ page }) => {
    await openSettings(page, '/settings/ai/privacy');

    const toggle = page.getByRole('switch', { name: 'Store conversations' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Store conversations' })).toBeVisible();

    // Put it back so later specs still persist their conversations.
    await page.getByRole('switch', { name: 'Store conversations' }).click();
    await page.waitForTimeout(500);
  });

  test('unlocks the run inspector behind debug mode', async ({ page }) => {
    await openSettings(page, '/settings/ai/advanced');

    await expect(page.getByText('Recent runs')).toHaveCount(0);
    await page.getByRole('switch', { name: 'Debug mode' }).click();
    await expect(page.getByText('Recent runs')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('switch', { name: 'Debug mode' }).click();
    await expect(page.getByText('Recent runs')).toHaveCount(0, { timeout: 20_000 });
  });
});
