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

const cameraState = (page: Page) => page.evaluate(() => window.__factoryTwinCamera!());

const distance = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** Resolves once the camera has stopped moving. */
async function waitForCameraToSettle(page: Page) {
  let previous = await cameraState(page);
  await expect
      .poll(async () => {
        const now = await cameraState(page);
        const moved = distance(now.position, previous.position);
        previous = now;
        return moved;
      }, { intervals: [250] })
      .toBeLessThan(0.001);
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

  test('clicking a machine in 3D selects it and flies the camera to it', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const home = await cameraState(page);
    const point = (await page.evaluate(() => window.__factoryTwinProject!('PRS-01')))!;

    await page.mouse.click(box.x + point.x, box.y + point.y);
    await expect(page.getByTestId('details-panel').getByRole('heading', { name: 'Hydraulic press' })).toBeVisible();
    await waitForCameraToSettle(page);

    // The camera moved in close and now looks at the press.
    const near = await cameraState(page);
    const press = [0.8, 0, -2.6];
    expect(distance(near.position, near.target)).toBeLessThan(distance(home.position, home.target) * 0.7);
    expect(Math.hypot(near.target[0]! - press[0]!, near.target[2]! - press[2]!)).toBeLessThan(0.5);

    // The press is drawn in the free area left of the panel, not under it.
    const onScreen = (await page.evaluate(() => window.__factoryTwinProject!('PRS-01')))!;
    const panel = (await page.getByTestId('details-panel').boundingBox())!;
    expect(box.x + onScreen.x).toBeLessThan(panel.x);
    expect(Math.abs(box.x + onScreen.x - (box.x + panel.x) / 2)).toBeLessThan(120);
  });

  test('Escape closes the panel and flies back to the overview', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const home = await cameraState(page);
    await page.getByRole('button', { name: /SCN-01/ }).click();
    await waitForCameraToSettle(page);
    expect(distance((await cameraState(page)).position, home.position)).toBeGreaterThan(2);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('details-panel')).toHaveAttribute('aria-hidden', 'true');
    await waitForCameraToSettle(page);
    const back = await cameraState(page);
    expect(distance(back.position, home.position)).toBeLessThan(0.05);
    expect(distance(back.target, home.target)).toBeLessThan(0.05);
  });

  test('clicking empty space deselects, but an orbit drag does not', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.getByRole('button', { name: /CNC-02/ }).click();
    await waitForCameraToSettle(page);
    const panel = page.getByTestId('details-panel');

    // Drag across the top of the view (the back wall, which is not clickable) to orbit.
    const y = box.y + 30;
    await page.mouse.move(box.x + 300, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 420, y + 10, { steps: 8 });
    await page.mouse.up();
    await expect(panel).toHaveAttribute('aria-hidden', 'false');

    // A plain click on the same spot closes the panel.
    await page.mouse.click(box.x + 300, y);
    await expect(panel).toHaveAttribute('aria-hidden', 'true');
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