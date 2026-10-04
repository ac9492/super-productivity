import { expect, test } from '../../fixtures/test.fixture';
import type { Locator } from '@playwright/test';
import {
  selectDragTasks as select,
  startTaskDrag as startDrag,
  dropTaskDrag as drop,
  createDragSection as createSection,
} from '../../utils/task-multi-drag';

test.describe('Multi-task drag', () => {
  test('moves a group into a section, between sections, and back to root in order', async ({
    page,
    workViewPage,
    projectPage,
    testPrefix,
  }) => {
    await workViewPage.waitForTaskList();
    await projectPage.createProject('Drag source');
    await projectPage.navigateToProjectByName('Drag source');
    const names = ['A', 'B', 'Keep'].map((n) => testPrefix + '-' + n);
    for (const name of names) await workViewPage.addTask(name);
    await createSection(page, 'Left');
    await createSection(page, 'Right');
    const section = (name: string): Locator =>
      page
        .locator('.section-container')
        .filter({ has: page.locator('.collapsible-title', { hasText: name }) });
    const row = (name: string): Locator =>
      page
        .locator('task:not(.cdk-drag-preview)')
        .filter({ has: page.locator('task-title', { hasText: name }) })
        .first();
    await select(page, [names[0], names[1]]);
    const order = await page
      .locator('task.isMultiSelected .task-title')
      .allTextContents();
    await startDrag(page, row(names[0]).locator('done-toggle'));
    await expect(page.locator('.multi-task-drag-preview')).toContainText('2 selected');
    await drop(page, section('Left').locator('task-list').first());
    await expect(section('Left').locator('task .task-title')).toHaveText(order);
    await select(page, [names[0], names[1]]);
    await startDrag(page, row(names[0]).locator('done-toggle'));
    await drop(page, section('Right').locator('task-list').first());
    await expect(section('Left').locator('task')).toHaveCount(0);
    await expect(section('Right').locator('task .task-title')).toHaveText(order);
    await select(page, [names[0], names[1]]);
    await startDrag(page, row(names[0]).locator('done-toggle'));
    await drop(page, page.locator('.no-section task-list').first(), true);
    await expect(section('Right').locator('task')).toHaveCount(0);
    await expect(page.locator('.no-section task .task-title')).toHaveText([
      ...order,
      names[2],
    ]);
    await page.reload();
    await workViewPage.waitForTaskList();
    await expect(page.locator('.no-section task .task-title')).toHaveText([
      ...order,
      names[2],
    ]);
  });

  test('moves selected parents with their subtasks to a sidebar project', async ({
    page,
    workViewPage,
    projectPage,
    testPrefix,
  }) => {
    await workViewPage.waitForTaskList();
    await projectPage.createProject('Drag target');
    await projectPage.createProject('Drag source');
    await projectPage.navigateToProjectByName('Drag source');
    const names = ['Parent', 'Other', 'Keep'].map((n) => testPrefix + '-' + n);
    for (const name of names) await workViewPage.addTask(name);
    const row = page
      .locator('task')
      .filter({ has: page.locator('task-title', { hasText: names[0] }) })
      .first();
    await workViewPage.addSubTask(row, testPrefix + '-Child');
    const target = page
      .locator('nav-item[data-project-id]')
      .filter({ hasText: 'Drag target' })
      .first();
    if (!(await target.isVisible()))
      await page
        .locator('nav-list-tree')
        .filter({ hasText: 'Projects' })
        .locator('nav-item button')
        .first()
        .click();
    await select(page, [names[0], names[1]]);
    await startDrag(page, row.locator('done-toggle').first());
    await expect(page.locator('.multi-task-drag-preview')).toContainText('2 selected');
    await drop(page, target);
    await expect(page.locator('task').filter({ hasText: names[1] })).toHaveCount(0);
    await expect(page.locator('task').filter({ hasText: names[2] })).toHaveCount(1);
    await projectPage.navigateToProjectByName('Drag target');
    await expect(page.locator('task')).toHaveCount(3);
    await expect(
      page
        .locator('task')
        .filter({ hasText: testPrefix + '-Child' })
        .last(),
    ).toBeVisible();
    await page.reload();
    await workViewPage.waitForTaskList();
    await expect(page.locator('task')).toHaveCount(3);
  });

  test('keeps single-task dragging and plain-click clearing intact on 500 rendered tasks', async ({
    page,
    workViewPage,
    projectPage,
    testPrefix,
  }) => {
    test.setTimeout(180000);
    await workViewPage.waitForTaskList();
    await projectPage.createProject('Large drag');
    await projectPage.navigateToProjectByName('Large drag');
    await workViewPage.addTask(testPrefix + '-Seed');
    await page.evaluate(async (seedTitle) => {
      type TaskLike = { id: string; projectId: string; title: string };
      type State = { tasks: { entities: Record<string, TaskLike> } };
      const store = (
        window as unknown as {
          __e2eTestHelpers: {
            store: {
              subscribe: (next: (s: State) => void) => { unsubscribe: () => void };
              dispatch: (a: unknown) => void;
            };
          };
        }
      ).__e2eTestHelpers.store;
      let seed!: TaskLike;
      const subscription = store.subscribe((state) => {
        seed = Object.values(state.tasks.entities).find(
          (task) => task.title === seedTitle,
        )!;
      });
      subscription.unsubscribe();
      for (let i = 0; i < 499; i++) {
        const id = 'large-drag-' + i;
        store.dispatch({
          type: '[Task Shared] addTask',
          task: { ...seed, id, title: 'Large ' + i },
          workContextId: seed.projectId,
          workContextType: 'PROJECT',
          isAddToBacklog: false,
          isAddToBottom: true,
          meta: { isPersistent: true, entityType: 'TASK', entityId: id, opType: 'CRT' },
        });
        // Allow normal operation persistence and rendering between setup batches.
        if (i % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }, testPrefix + '-Seed');
    await expect(page.locator('task')).toHaveCount(500);
    await createSection(page, 'Target');
    await select(page, ['Large 496', 'Large 497']);
    await page
      .locator('task')
      .filter({ has: page.locator('task-title', { hasText: 'Large 496', exact: true }) })
      .locator('done-toggle')
      .click();
    await expect(page.locator('task-multi-select-bar .bar')).toHaveCount(0);
    // Restore the task, then dragging an unselected row must remain a single drag.
    await page
      .locator('task')
      .filter({ has: page.locator('task-title', { hasText: 'Large 496', exact: true }) })
      .locator('done-toggle')
      .click();
    await select(page, ['Large 496', 'Large 497']);
    await startDrag(
      page,
      page
        .locator('task')
        .filter({
          has: page.locator('task-title', { hasText: 'Large 498', exact: true }),
        })
        .locator('done-toggle'),
    );
    await expect(page.locator('.multi-task-drag-preview')).toHaveCount(0);
    await drop(page, page.locator('.section-container task-list').first());
    await expect(page.locator('.section-container task .task-title')).toHaveText([
      'Large 498',
    ]);
    await select(page, ['Large 496', 'Large 497']);
    await startDrag(
      page,
      page.locator('task.isMultiSelected').first().locator('done-toggle'),
    );
    await expect(page.locator('.multi-task-drag-preview')).toContainText('2 selected');
    await drop(page, page.locator('.section-container task-list').first());
    await expect(page.locator('.section-container task')).toHaveCount(3);
    await expect(page.locator('.no-section task')).toHaveCount(497);
  });

  test('Escape cancels a group drop without moving one task', async ({
    page,
    workViewPage,
    projectPage,
    testPrefix,
  }) => {
    await workViewPage.waitForTaskList();
    await projectPage.createProject('Cancel drag');
    await projectPage.navigateToProjectByName('Cancel drag');
    const names = ['A', 'B'].map((n) => testPrefix + '-' + n);
    for (const name of names) await workViewPage.addTask(name);
    await createSection(page, 'Target');
    await select(page, names);
    await startDrag(
      page,
      page.locator('task.isMultiSelected').first().locator('done-toggle'),
    );
    await page.keyboard.press('Escape');
    await drop(page, page.locator('.section-container task-list').first());
    await expect(page.locator('.no-section task')).toHaveCount(2);
    await expect(page.locator('.section-container task')).toHaveCount(0);
    await expect(page.locator('.multi-task-drag-preview')).toHaveCount(0);
  });
});
