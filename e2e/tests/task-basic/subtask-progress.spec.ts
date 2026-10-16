import { test, expect } from '../../fixtures/test.fixture';

test.describe('Subtask progress', () => {
  test('shows completed/total subtask counts that survive collapsing', async ({
    page,
    workViewPage,
    taskPage,
  }) => {
    await workViewPage.waitForTaskList();
    await workViewPage.addTask('Progress parent');
    const parent = taskPage.getTaskByText('Progress parent');
    await expect(parent.locator('.subtask-progress')).toHaveCount(0);
    await parent.focus();
    await page.keyboard.press('a');
    const draft = parent.locator('.e2e-add-subtask-input');
    await draft.fill('First child');
    await draft.press('Enter');
    await draft.press('Escape');
    await expect(parent.locator('.subtask-progress')).toHaveText('0/1');
    await parent.focus();
    await page.keyboard.press('a');
    await expect(draft).toBeFocused();
    await draft.fill('Second child');
    await draft.press('Enter');
    await draft.press('Escape');
    await expect(parent.locator('.subtask-progress')).toHaveText('0/2');
    await parent.locator('.sub-tasks task').first().locator('done-toggle').click();
    await expect(parent.locator('.subtask-progress')).toHaveText('1/2');
    await expect(
      parent.getByRole('img', { name: 'Completed subtasks: 1/2' }),
    ).toBeVisible();
    await parent.locator('.toggle-sub-tasks-btn').click();
    await expect(parent.locator('.subtask-progress')).toBeVisible();
    await expect(parent.locator('.subtask-progress')).toHaveText('1/2');
    await expect(
      parent.getByRole('img', { name: 'Completed subtasks: 1/2' }),
    ).toBeVisible();
    await parent.locator('.toggle-sub-tasks-btn').click();
    await expect(
      parent.locator('.sub-tasks task').filter({ hasText: 'Second child' }),
    ).toBeHidden();
    await expect(
      parent.getByRole('img', { name: 'Completed subtasks: 1/2' }),
    ).toBeVisible();
    await parent.locator('.toggle-sub-tasks-btn').click();
    await parent
      .locator('.sub-tasks task')
      .filter({ hasText: 'Second child' })
      .locator('done-toggle')
      .click();
    await expect(parent.locator('.subtask-progress')).toContainText('2/2');
    await expect(parent.locator('.subtask-progress')).toHaveClass(/is-complete/);
    await expect(parent.locator('.subtask-progress mat-icon')).toHaveText('check');
  });
});
