import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { TaskMultiSelectService } from './task-multi-select.service';
import { TaskBulkActionService } from './task-bulk-action.service';
import { selectTaskEntities } from './store/task.selectors';
import { selectAllSections } from '../section/store/section.selectors';
import { selectProjectFeatureState } from '../project/store/project.selectors';
import { SectionService } from '../section/section.service';
import { WorkContextService } from '../work-context/work-context.service';
import { WorkContextType } from '../work-context/work-context.model';
import { moveTaskInTodayList } from '../work-context/store/work-context-meta.actions';
import { getAnchorFromDragDrop } from '../work-context/store/work-context-meta.helper';
import { Task } from './task.model';

/** A transient snapshot: drop callbacks must not depend on rows surviving a move. */
@Injectable({ providedIn: 'root' })
export class TaskMultiDragService {
  private readonly _store = inject(Store);
  private readonly _selection = inject(TaskMultiSelectService);
  private readonly _bulk = inject(TaskBulkActionService);
  private readonly _sectionService = inject(SectionService);
  private readonly _context = inject(WorkContextService);
  private readonly _tasks = this._store.selectSignal(selectTaskEntities);
  private readonly _sections = this._store.selectSignal(selectAllSections);
  private readonly _projects = this._store.selectSignal(selectProjectFeatureState);
  private readonly _ids = signal<readonly string[]>([]);
  private readonly _cancelled = signal(false);
  private _stopListening?: () => void;
  readonly isCancelled = this._cancelled.asReadonly();
  readonly ids = this._ids.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }
  private readonly _regularIds = computed(() => {
    const task = this._tasks()[this.ids()[0]];
    return new Set(
      task ? (this._projects().entities[task.projectId]?.taskIds ?? []) : [],
    );
  });
  readonly selectedIds = this._selection.selectedIds;
  readonly selectionSize = computed(
    () =>
      [...this.selectedIds()].filter((id) => {
        const task = this._tasks()[id];
        return task && !task.parentId;
      }).length,
  );

  start(task: Task): void {
    this.clear();
    if (
      task.parentId ||
      !this._selection.has(task.id) ||
      this._selection.isTouchSelectionMode()
    )
      return;
    const entities = this._tasks();
    const ids = this._selection
      .selectedIdsInDomOrder()
      .filter((id) => entities[id] && !entities[id]!.parentId);
    if (ids.length > 1) {
      this._ids.set(ids);
      const cancel = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') this._cancelled.set(true);
      };
      window.addEventListener('keydown', cancel);
      this._stopListening = () => window.removeEventListener('keydown', cancel);
    }
  }

  finish(): void {
    // CDK emits ended before dropped; keep the snapshot through both callbacks.
    const ids = this.ids();
    queueMicrotask(() => {
      if (this.ids() === ids) this.clear();
    });
  }

  clear(): void {
    this._stopListening?.();
    this._stopListening = undefined;
    this._cancelled.set(false);
    this._ids.set([]);
  }

  /** Group drops only target regular project lists and their sections. */
  canDrop(listId: string, modelId: string, groupTagId?: string | null): boolean {
    if (this.isCancelled()) return false;
    const projectId = this._context.activeWorkContextId;
    if (
      listId !== 'PARENT' ||
      groupTagId !== undefined ||
      this._context.activeWorkContextType !== WorkContextType.PROJECT ||
      !projectId
    )
      return false;
    const project = this._projects().entities[projectId];
    if (
      !project ||
      !this.ids().length ||
      this.ids().some((id) => {
        const task = this._tasks()[id];
        return (
          !task ||
          task.parentId ||
          task.isDone ||
          task.projectId !== projectId ||
          !this._regularIds().has(id)
        );
      })
    )
      return false;
    return (
      modelId === 'UNDONE' ||
      this._sections().some(
        (section) =>
          section.id === modelId &&
          section.contextType === WorkContextType.PROJECT &&
          section.contextId === projectId,
      )
    );
  }

  async drop(modelId: string, leaderId: string, orderedIds: string[]): Promise<void> {
    if (!this.canDrop('PARENT', modelId)) return;
    const projectId = this._context.activeWorkContextId!;
    const ids = [...this.ids()];
    const selected = new Set(ids);
    // CDK moves one placeholder; remove the other selected rows from its anchor.
    const afterLeader = getAnchorFromDragDrop(leaderId, orderedIds);
    let anchorIndex = afterLeader === null ? -1 : orderedIds.indexOf(afterLeader);
    while (anchorIndex >= 0 && selected.has(orderedIds[anchorIndex])) anchorIndex--;
    let afterTaskId = anchorIndex < 0 ? null : orderedIds[anchorIndex];
    const sections = this._sections().filter(
      (section) =>
        section.contextId === projectId &&
        section.contextType === WorkContextType.PROJECT,
    );
    const sourceByTask = new Map(
      sections.flatMap((section) =>
        section.taskIds.map((id) => [id, section.id] as const),
      ),
    );
    this._selection.setBulkFeedbackSuppressed(true);
    try {
      for (const id of ids) {
        const source = sourceByTask.get(id) ?? null;
        if (modelId !== 'UNDONE') {
          this._sectionService.addTaskToSection(modelId, id, afterTaskId, source);
        } else if (source) {
          this._sectionService.removeTaskFromSection(
            source,
            id,
            projectId,
            WorkContextType.PROJECT,
            afterTaskId,
          );
        } else {
          this._store.dispatch(
            moveTaskInTodayList({
              taskId: id,
              afterTaskId,
              src: 'UNDONE',
              target: 'UNDONE',
              workContextId: projectId,
              workContextType: WorkContextType.PROJECT,
            }),
          );
        }
        afterTaskId = id;
      }
      // Existing bulk workflow: each placement is a normal replay-atomic action.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    } finally {
      this._selection.setBulkFeedbackSuppressed(false);
    }
  }

  moveToProject(projectId: string, ids: readonly string[]): Promise<void> {
    return this._bulk.moveToProject(projectId, ids);
  }
}
