import { expect, test } from '../../fixtures/test.fixture';

test('scheduled badges color date ranges in light and dark mode without changing text', async ({
  page,
  workViewPage,
  testPrefix,
}) => {
  await page.goto('/#/project/INBOX_PROJECT/tasks');
  await workViewPage.waitForTaskList();
  await page.waitForFunction(
    () => !!(window as unknown as { __e2eTestHelpers?: unknown }).__e2eTestHelpers,
  );

  const ranges = [
    { days: -1, color: 'overdue' },
    { days: 0, color: 'today' },
    { days: 1, color: 'tomorrow' },
    { days: 2, color: 'upcoming' },
    { days: 8, color: 'upcoming' },
    { days: 9, color: '' },
  ];
  for (const range of ranges) {
    const title = testPrefix + ' date ' + range.days;
    await workViewPage.addTask(title);
    const row = page
      .locator('task')
      .filter({ has: page.locator('task-title', { hasText: title }) });
    const taskId = await row.getAttribute('data-task-id');
    await page.evaluate(
      ({ id, days }) => {
        const date = new Date();
        date.setDate(date.getDate() + days);
        const dueDay = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, '0'),
          String(date.getDate()).padStart(2, '0'),
        ].join('-');
        const store = (
          window as unknown as {
            __e2eTestHelpers: { store: { dispatch: (action: unknown) => void } };
          }
        ).__e2eTestHelpers.store;
        store.dispatch({
          type: '[Task Shared] updateTask',
          task: { id, changes: { dueDay } },
          meta: { isPersistent: true, entityType: 'TASK', entityId: id, opType: 'UPD' },
        });
      },
      { id: taskId, days: range.days },
    );
    await expect(row.locator('.schedule-btn .time-badge')).toHaveAttribute(
      'data-scheduled-date-color',
      range.color,
    );
  }

  const badges = page.locator('.schedule-btn .time-badge');
  const text = await badges.allTextContents();
  for (const dark of [false, true]) {
    await page.evaluate(
      (isDark) => document.body.classList.toggle('isDarkTheme', isDark),
      dark,
    );
    for (const color of ['today', 'tomorrow', 'upcoming']) {
      const badge = page
        .locator('.time-badge[data-scheduled-date-color="' + color + '"]')
        .first();
      const contrast = await badge.evaluate((element) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const luminance = (css: string): number => {
          context.fillStyle = css;
          context.fillRect(0, 0, 1, 1);
          const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          });
          const red = rgb[0] * 0.2126;
          const green = rgb[1] * 0.7152;
          const blue = rgb[2] * 0.0722;
          return red + green + blue;
        };
        const style = getComputedStyle(element);
        const a = luminance(style.color);
        const b = luminance(style.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(
        contrast,
        color + ' contrast in ' + (dark ? 'dark' : 'light'),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(await badges.allTextContents()).toEqual(text);
    await page.screenshot({
      path:
        '.tmp/e2e-test-results/scheduled-date-colors-' +
        (dark ? 'dark' : 'light') +
        '.png',
      fullPage: true,
    });
  }
});
