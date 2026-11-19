import { expect, test, type Page } from '@playwright/test';

const MACHINE_COUNT = 8;

/** Waits until the 3D scene has loaded its models and can project machine positions. */
async function waitForScene(page: Page) {
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const p = window.__factoryTwinProject?.('CNC-01');
    return !!p && Number.isFinite(p.x);
  });
}

const statusTotal = async (page: Page) => {
  let total = 0;
  for (const s of ['running', 'warning', 'error']) {
    const text = await page.getByTestId(`count-${s}`).innerText();
    total += Number.parseInt(text.replace(/\D+/g, ' ').trim(), 10);
  }
  return total;
};

test.describe('Factory Twin dashboard', () => {
  test('streams live data from the simulator server', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('connection')).toHaveText('Live from server');
    await waitForScene(page);
    await expect(page.getByRole('navigation', { name: 'Machines' }).getByRole('button')).toHaveCount(MACHINE_COUNT);
    await expect.poll(() => statusTotal(page)).toBe(MACHINE_COUNT);

    // The store keeps receiving ticks.
    const first = await page.evaluate(() => window.__factoryTwin!.getState().lastUpdate);
    await expect.poll(() => page.evaluate(() => window.__factoryTwin!.getState().lastUpdate)).toBeGreaterThan(first!);
  });

  test('opens the details panel from the machine list and closes it with Escape', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.getByRole('button', { name: /RBT-01/ }).click();

    const panel = page.getByTestId('details-panel');
    await expect(panel.getByRole('heading', { name: 'Pick-and-place robot' })).toBeVisible();
    await expect(panel.getByRole('figure', { name: 'Temperature chart' }).locator('.recharts-line-curve')).toBeVisible();
    await expect(panel.getByRole('figure', { name: 'Throughput chart' }).locator('.recharts-area-curve')).toBeVisible();

    await panel.getByRole('button', { name: 'Last 15 min' }).click();
    await expect(panel.getByRole('button', { name: 'Last 15 min' })).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  test('selects a machine by clicking it in the 3D scene', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const point = (await page.evaluate(() => window.__factoryTwinProject!('PRS-01')))!;

    await page.mouse.click(box.x + point.x, box.y + point.y);
    await expect(page.getByTestId('details-panel').getByRole('heading', { name: 'Hydraulic press' })).toBeVisible();

    // Clicking empty floor clears the selection.
    await page.mouse.click(box.x + 40, box.y + box.height - 40);
    await expect(page.getByTestId('details-panel')).toHaveAttribute('aria-hidden', 'true');
  });

  test('falls back to the in-browser simulator', async ({ page }) => {
    await page.goto('/?source=local');
    await expect(page.getByTestId('connection')).toHaveText('Simulated in browser');
    await expect.poll(() => statusTotal(page)).toBe(MACHINE_COUNT);
  });

  test('uses the browser simulator when the server is unreachable', async ({ page }) => {
    await page.goto('/?ws=ws://localhost:9/ws');
    await expect(page.getByTestId('connection')).toHaveText('Simulated in browser', { timeout: 15_000 });
  });

  test('works as a bottom sheet on a phone @mobile', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.getByRole('button', { name: /SCN-01/ }).click();
    const heading = page.getByTestId('details-panel').getByRole('heading', { name: 'Quality scanner' });
    await expect(heading).toBeInViewport();
  });
});
