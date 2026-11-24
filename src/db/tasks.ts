import type { CreateTaskInput, UpdateTaskInput } from '../../shared/types';
import { getApi } from './client';

export const tasksRepo = {
  list: (sessionId: string) => getApi().listTasks(sessionId),
  create: (input: CreateTaskInput) => getApi().createTask(input),
  update: (input: UpdateTaskInput) => getApi().updateTask(input),
  toggle: (id: string) => getApi().toggleTask(id),
  remove: (id: string) => getApi().softDeleteTask(id),
};
