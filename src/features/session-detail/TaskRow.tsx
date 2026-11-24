import type { Task } from '../../../shared/types';
import { Button } from '../../components/Button';
import { formatDueLabel } from '../../domain/time';
import styles from './session-detail.module.css';

interface TaskRowProps {
  task: Task;
  selected?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function TaskRow({
  task,
  selected = false,
  onToggleSelect,
  onToggle,
  onEdit,
  onDelete,
}: TaskRowProps) {
  const due = task.dueDate ? formatDueLabel(task.dueDate) : null;
  const dueId = `task-due-${task.id}`;

  return (
    <li className={styles.task} data-done={task.isDone}>
      {onToggleSelect ? (
        <input
          type="checkbox"
          className={styles.selectCheckbox}
          checked={selected}
          onChange={() => onToggleSelect(task.id)}
          aria-label={`Select task ${task.description}`}
        />
      ) : null}

      <label className={styles.checkWrap}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={task.isDone}
          onChange={onToggle}
          aria-label={task.description}
          aria-describedby={due ? dueId : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onEdit();
            }
          }}
        />
      </label>

      <div className={styles.taskBody}>
        <span className={styles.taskText}>{task.description}</span>
        {due ? (
          <span id={dueId} className={styles.due} data-state={due.state}>
            {due.text}
          </span>
        ) : null}
      </div>

      <div className={styles.taskActions}>
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${task.description}`}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="dangerGhost"
          onClick={onDelete}
          aria-label={`Delete ${task.description}`}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}
