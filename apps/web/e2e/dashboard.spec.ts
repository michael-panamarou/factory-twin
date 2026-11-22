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

  for (const source of ['live', 'local'] as const) {
    test(`Trigger incident puts a machine into warning or error and flies to it (${source})`, async ({ page }) => {
      await page.goto(source === 'local' ? '/?source=local' : '/');
      await expect(page.getByTestId('connection')).toHaveText(source === 'local' ? 'Simulated in browser' : 'Live from server');
      await waitForScene(page);
      const home = await cameraState(page);

      await page.getByRole('button', { name: 'Trigger incident' }).click();

      const panel = page.getByTestId('details-panel');
      await expect(panel).toHaveAttribute('aria-hidden', 'false');
      await expect(page.getByTestId('panel-status').getByText(/^(Warning|Error)$/)).toBeVisible({ timeout: 10_000 });
      await waitForCameraToSettle(page);
      expect(distance((await cameraState(page)).position, home.position)).toBeGreaterThan(2);
    });
  }

  test('alert list: a new incident raises the badge, and "jump to machine" flies there', async ({ page }) => {
    await page.goto('/?source=local');
    await waitForScene(page);

    // Start an incident, then close its details so we arrive via the alert list.
    await page.getByRole('button', { name: 'Trigger incident' }).click();
    const machineId = (await page.evaluate(() => window.__factoryTwin!.getState().selectedId))!;
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('alerts-badge')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^Alerts, \d+ new$/ }).click();
    const list = page.getByTestId('alerts-panel');
    await expect(list).toHaveAttribute('aria-hidden', 'false');
    // A jam can clear before the list opens, so look for the warning or error row, not just the newest.
    const row = list.locator(`.alert-row--warning[data-machine="${machineId}"], .alert-row--error[data-machine="${machineId}"]`).first();
    await expect(row).toHaveAccessibleName(/^(Warning|Error), new:/);

    await row.click();
    await expect(page.getByTestId('details-panel')).toHaveAttribute('aria-hidden', 'false');
    expect(await page.evaluate(() => window.__factoryTwin!.getState().selectedId)).toBe(machineId);
    await waitForCameraToSettle(page);

    // The machine is drawn in the gap between the alert list and the details panel.
    const canvas = (await page.locator('canvas').boundingBox())!;
    const onScreen = (await page.evaluate((id) => window.__factoryTwinProject!(id), machineId))!;
    const left = (await list.boundingBox())!;
    const right = (await page.getByTestId('details-panel').boundingBox())!;
    const x = canvas.x + onScreen.x;
    expect(x).toBeGreaterThan(left.x + left.width);
    expect(x).toBeLessThan(right.x);

    // Escape closes the list first (and marks it read), then the details panel.
    await page.keyboard.press('Escape');
    await expect(list).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('alerts-badge')).toHaveCount(0);
    await expect(page.getByTestId('details-panel')).toHaveAttribute('aria-hidden', 'false');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('details-panel')).toHaveAttribute('aria-hidden', 'true');
  });

  test('timeline: scrub back to replay the past, play it, and return to live', async ({ page }) => {
    await page.goto('/?source=local');
    await waitForScene(page);
    const timeline = page.getByTestId('timeline');
    const slider = timeline.getByRole('slider', { name: 'Time' });
    const trigger = page.getByRole('button', { name: 'Trigger incident' });
    const replayTime = () => page.evaluate(() => window.__factoryTwin!.getState().replay?.time ?? null);
    await expect(slider).toHaveAttribute('aria-valuetext', 'Live');

    // Jump to the start of the hour with the keyboard.
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', /ago$/);
    await expect(trigger).toBeDisabled();
    const start = (await replayTime())!;

    await timeline.getByRole('button', { name: '60×' }).click();
    await timeline.getByRole('button', { name: 'Play replay' }).click();
    await expect.poll(async () => ((await replayTime()) ?? 0) - start).toBeGreaterThan(30_000);
    await timeline.getByRole('button', { name: 'Pause replay' }).click();

    await timeline.getByRole('button', { name: 'Live' }).click();
    await expect(slider).toHaveAttribute('aria-valuetext', 'Live');
    expect(await replayTime()).toBeNull();
    await expect(trigger).toBeEnabled();
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

  test('alert list fills the screen on a phone and gets out of the way on jump @mobile', async ({ page }) => {
    await page.goto('/?source=local');
    await waitForScene(page);
    await page.getByRole('button', { name: /^Alerts/ }).click();
    const list = page.getByTestId('alerts-panel');
    await expect(list.getByRole('heading', { name: 'Alerts' })).toBeInViewport();

    const row = list.getByRole('button', { name: /Jump to machine/ }).first();
    const machineId = await row.getAttribute('data-machine');
    await row.click();
    await expect(list).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('details-panel')).toHaveAttribute('aria-hidden', 'false');
    expect(await page.evaluate(() => window.__factoryTwin!.getState().selectedId)).toBe(machineId);
  });

  test('timeline fits on a phone @mobile', async ({ page }) => {
    await page.goto('/?source=local');
    await waitForScene(page);
    const timeline = page.getByTestId('timeline');
    await expect(timeline).toBeInViewport({ ratio: 1 });
    await expect(timeline.getByRole('button', { name: 'Live' })).toBeInViewport({ ratio: 1 });
  });

  test('works as a bottom sheet on a phone @mobile', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.getByRole('button', { name: /SCN-01/ }).click();
    const heading = page.getByTestId('details-panel').getByRole('heading', { name: 'Quality scanner' });
    await expect(heading).toBeInViewport();
  });
});