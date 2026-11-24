import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExportFormat, SessionStatus, Task } from '../../../shared/types';
import { Button } from '../../components/Button';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LiveRegion } from '../../components/LiveRegion';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusChip } from '../../components/StatusChip';
import {
  useBulkDeleteTasks,
  useCreateTask,
  useDeleteTask,
  useRenameSession,
  useRestoreSession,
  useSession,
  useSetSessionStatus,
  useTasks,
  useToggleTask,
  useUpdateTask,
} from '../../db/queries';
import { sessionsRepo } from '../../db/sessions';
import { DUE_WINDOWS, filterTasks, type DueWindow } from '../../domain/filters';
import { computeProgress } from '../../domain/progress';
import { errorMessage } from '../../lib/errors';
import { TaskComposer } from './TaskComposer';
import { TaskEditDialog } from './TaskEditDialog';
import { TaskRow } from './TaskRow';
import styles from './session-detail.module.css';

const STATUS_OPTIONS: { value: SessionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

interface SessionDetailProps {
  sessionId: string;
}

export function SessionDetail({ sessionId }: SessionDetailProps) {
  const sessionQuery = useSession(sessionId);
  const tasksQuery = useTasks(sessionId);
  const session = sessionQuery.data;

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);

  const [titleDraft, setTitleDraft] = useState('');
  const [taskQuery, setTaskQuery] = useState('');
  const [dueWindow, setDueWindow] = useState<DueWindow>('any');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const lastPercent = useRef<number | null>(null);

  const renameSession = useRenameSession();
  const setStatus = useSetSessionStatus();
  const restoreSession = useRestoreSession();
  const createTask = useCreateTask(sessionId);
  const toggleTask = useToggleTask(sessionId);
  const updateTask = useUpdateTask(sessionId);
  const deleteTask = useDeleteTask(sessionId);
  const bulkDeleteTasks = useBulkDeleteTasks(sessionId);

  useEffect(() => {
    if (session) setTitleDraft(session.title);
  }, [session?.id, session?.title]);

  const progress = useMemo(() => computeProgress(tasks), [tasks]);

  // PLAN.md M4: announce only when the percentage actually changes.
  useEffect(() => {
    if (lastPercent.current === null) {
      lastPercent.current = progress.percent;
      return;
    }

    if (progress.percent !== lastPercent.current) {
      lastPercent.current = progress.percent;
      setAnnouncement(`${progress.label}, ${progress.percent} percent`);
    }
  }, [progress.percent, progress.label]);

  const visibleTasks = useMemo(
    () => filterTasks(tasks, { query: taskQuery, dueWindow }),
    [tasks, taskQuery, dueWindow],
  );
  const openTasks = visibleTasks.filter((task) => !task.isDone);
  const doneTasks = visibleTasks.filter((task) => task.isDone);
  const isFiltering = taskQuery.trim().length > 0 || dueWindow !== 'any';

  useEffect(() => {
    setSelectedTaskIds([]);
  }, [sessionId]);

  function toggleTaskSelect(taskId: string) {
    setSelectedTaskIds((previous) =>
      previous.includes(taskId) ? previous.filter((id) => id !== taskId) : [...previous, taskId],
    );
  }

  async function handleBulkDelete() {
    const taskIds = selectedTaskIds;
    setSelectedTaskIds([]);
    if (taskIds.length === 0) return;
    try {
      await bulkDeleteTasks.mutateAsync(taskIds);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const emptyOpenCopy =
    tasks.length === 0
      ? 'No tasks yet — add the first one above.'
      : isFiltering
        ? 'Nothing matches this search or filter.'
        : 'Everything is done. Nice.';
  const isDeleted = session?.deletedAt !== null && session?.deletedAt !== undefined;

  if (sessionQuery.isLoading) {
    return (
      <p className={styles.status} role="status">
        Opening session…
      </p>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <div className={styles.detail}>
        <ErrorBanner
          message={
            sessionQuery.isError
              ? errorMessage(sessionQuery.error)
              : 'This session could not be found. It may have been removed outside the app.'
          }
        />
      </div>
    );
  }

  function commitTitle() {
    if (!session) return;

    const trimmed = titleDraft.trim();
    if (trimmed.length === 0 || trimmed === session.title) {
      setTitleDraft(session.title);
      return;
    }

    renameSession.mutate(
      { id: session.id, title: trimmed },
      {
        onError: (caught) => {
          setError(errorMessage(caught));
          setTitleDraft(session.title);
        },
      },
    );
  }

  async function handleExport(format: ExportFormat) {
    if (!session) return;

    setError('');
    setNotice('');
    try {
      const result = await sessionsRepo.export(session.id, format);
      if (result) {
        setNotice(`Exported to ${result.path}`);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <article className={styles.detail} aria-labelledby="session-heading">
      <h2 id="session-heading" className="sr-only">
        {session.title}
      </h2>

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <input
            className={styles.titleInput}
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                setTitleDraft(session.title);
                event.currentTarget.blur();
              }
            }}
            aria-label="Session title"
            maxLength={200}
          />
          <StatusChip status={session.status} deleted={isDeleted} />
        </div>

        <div className={styles.metaRow}>
          <label className={styles.metaLabel} htmlFor="session-status">
            Status
          </label>
          <select
            id="session-status"
            className={styles.statusSelect}
            value={session.status}
            onChange={(event) =>
              setStatus.mutate(
                { id: session.id, status: event.target.value as SessionStatus },
                { onError: (caught) => setError(errorMessage(caught)) },
              )
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <span className={styles.metaGap} aria-hidden="true" />

          <Button size="sm" variant="ghost" onClick={() => void handleExport('csv')}>
            Export CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void handleExport('json')}>
            Export JSON
          </Button>
        </div>

        <div className={styles.progressRow}>
          <ProgressBar progress={progress} label="Session progress" size="lg" />
        </div>
        <p className={styles.progressLabel}>{progress.label}</p>
      </header>

      <LiveRegion message={announcement} />

      {isDeleted ? (
        <div className={styles.notice} role="status">
          <span>This session is deleted. It stays recoverable under Archived.</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              restoreSession.mutate(session.id, {
                onError: (caught) => setError(errorMessage(caught)),
                onSuccess: () => setNotice('Session restored to Active.'),
              })
            }
          >
            Restore session
          </Button>
        </div>
      ) : null}

      {error ? <ErrorBanner message={error} onDismiss={() => setError('')} /> : null}

      {notice ? (
        <p className={styles.savedNotice} role="status">
          {notice}
        </p>
      ) : null}

      <TaskComposer
        onAdd={async (input) => {
          await createTask.mutateAsync(input);
        }}
      />

      {selectedTaskIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkBarLabel}>
            {selectedTaskIds.length} task{selectedTaskIds.length === 1 ? '' : 's'} selected
          </span>
          <Button
            size="sm"
            variant="dangerGhost"
            onClick={() => void handleBulkDelete()}
            disabled={bulkDeleteTasks.isPending}
          >
            {bulkDeleteTasks.isPending ? 'Deleting...' : 'Delete selected'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedTaskIds([])}>
            Clear
          </Button>
        </div>
      ) : null}

      <section className={styles.section} aria-labelledby="open-tasks-heading">
        <div className={styles.sectionHeader}>
          <h3 id="open-tasks-heading" className={styles.sectionTitle}>
            To do <span className={styles.count}>{openTasks.length}</span>
          </h3>

          <div className={styles.taskFilters}>
            <label className="sr-only" htmlFor="task-search">
              Search tasks in this session
            </label>
            <input
              id="task-search"
              type="search"
              className={styles.taskSearch}
              value={taskQuery}
              placeholder="Search tasks"
              onChange={(event) => setTaskQuery(event.target.value)}
            />

            <label className="sr-only" htmlFor="task-due-window">
              Filter tasks by due date
            </label>
            <select
              id="task-due-window"
              className={styles.dueSelect}
              value={dueWindow}
              onChange={(event) => setDueWindow(event.target.value as DueWindow)}
            >
              {DUE_WINDOWS.map((window) => (
                <option key={window.value} value={window.value}>
                  {window.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {openTasks.length === 0 ? (
          <p className={styles.sectionEmpty}>{emptyOpenCopy}</p>
        ) : (
          <ul className={styles.tasks}>
            {openTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selectedTaskIds.includes(task.id)}
                onToggleSelect={toggleTaskSelect}
                onToggle={() =>
                  toggleTask.mutate(task.id, {
                    onError: (caught) => setError(errorMessage(caught)),
                  })
                }
                onEdit={() => setEditingTask(task)}
                onDelete={() =>
                  deleteTask.mutate(task.id, {
                    onError: (caught) => setError(errorMessage(caught)),
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} data-done="true" aria-labelledby="done-tasks-heading">
        <div className={styles.sectionHeader}>
          <h3 id="done-tasks-heading" className={styles.sectionTitle}>
            Done <span className={styles.count}>{doneTasks.length}</span>
          </h3>
        </div>

        {doneTasks.length === 0 ? (
          <p className={styles.sectionEmpty}>Finished tasks collect here.</p>
        ) : (
          <ul className={styles.tasks}>
            {doneTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selectedTaskIds.includes(task.id)}
                onToggleSelect={toggleTaskSelect}
                onToggle={() =>
                  toggleTask.mutate(task.id, {
                    onError: (caught) => setError(errorMessage(caught)),
                  })
                }
                onEdit={() => setEditingTask(task)}
                onDelete={() =>
                  deleteTask.mutate(task.id, {
                    onError: (caught) => setError(errorMessage(caught)),
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <TaskEditDialog
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={async (values) => {
          if (!editingTask) return;
          await updateTask.mutateAsync({ id: editingTask.id, ...values });
          setEditingTask(null);
        }}
      />

      <p className={styles.hint}>
        Tip: Ctrl+N creates a session, Ctrl+K jumps to search, Enter on a task opens the editor.
      </p>
    </article>
  );
}
