import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type {
  CreateSessionInput,
  ListSessionsInput,
  SessionStatus,
  SessionSummary,
  Task,
} from '../../shared/types';
import { sessionsRepo } from './sessions';
import { tasksRepo } from './tasks';

export const queryKeys = {
  sessions: (input: ListSessionsInput) =>
    ['sessions', input.view ?? 'all', input.query ?? ''] as const,
  session: (id: string | null) => ['session', id ?? 'none'] as const,
  tasks: (sessionId: string | null) => ['tasks', sessionId ?? 'none'] as const,
};

export function useSessions(input: ListSessionsInput) {
  return useQuery({
    queryKey: queryKeys.sessions(input),
    queryFn: () => sessionsRepo.list(input),
  });
}

export function useSession(id: string | null) {
  return useQuery({
    queryKey: queryKeys.session(id),
    queryFn: () => sessionsRepo.get(id as string),
    enabled: id !== null,
  });
}

export function useTasks(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.tasks(sessionId),
    queryFn: () => tasksRepo.list(sessionId as string),
    enabled: sessionId !== null,
  });
}

/** Everything that can change a count has to refresh the lists. */
function useRefreshAfterWrite() {
  const queryClient = useQueryClient();

  return useCallback(
    (sessionId?: string) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['session'] });
      if (sessionId) {
        void queryClient.invalidateQueries({ queryKey: ['tasks', sessionId] });
      }
    },
    [queryClient],
  );
}

export function useCreateSession() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (input: CreateSessionInput) => sessionsRepo.create(input),
    onSuccess: () => refresh(),
  });
}

export function useRenameSession() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (input: { id: string; title: string }) =>
      sessionsRepo.rename(input.id, input.title),
    onSuccess: (_session, input) => refresh(input.id),
  });
}

export function useSetSessionStatus() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (input: { id: string; status: SessionStatus }) =>
      sessionsRepo.setStatus(input.id, input.status),
    onSuccess: (_session, input) => refresh(input.id),
  });
}

export function useDeleteSession() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (id: string) => sessionsRepo.remove(id),
    onSuccess: (_result, id) => refresh(id),
  });
}

export function useRestoreSession() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (id: string) => sessionsRepo.restore(id),
    onSuccess: (_session, id) => refresh(id),
  });
}

export function useCreateTask(sessionId: string) {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (input: { description: string; dueDate: string | null }) =>
      tasksRepo.create({ sessionId, ...input }),
    onSuccess: () => refresh(sessionId),
  });
}

export function useUpdateTask(sessionId: string) {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (input: { id: string; description?: string; dueDate?: string | null }) =>
      tasksRepo.update(input),
    onSuccess: () => refresh(sessionId),
  });
}

interface ToggleContext {
  previousTasks?: Task[];
  previousSessions?: [readonly unknown[], SessionSummary[] | undefined][];
}

/**
 * The core acceptance criterion: the bar moves immediately, the database write
 * settles a few milliseconds later.
 *
 * Toggling is deterministic, so the optimistic value already equals what SQLite
 * will return; the mutation result is written straight back into the cache
 * instead of triggering a refetch. A refetch here would race with the next
 * rapid click and could flip a checkbox back for a frame.
 */
export function useToggleTask(sessionId: string) {
  const queryClient = useQueryClient();
  const tasksKey = queryKeys.tasks(sessionId);

  return useMutation({
    mutationFn: (taskId: string) => tasksRepo.toggle(taskId),
    onMutate: async (taskId): Promise<ToggleContext> => {
      await queryClient.cancelQueries({ queryKey: tasksKey });

      const previousTasks = queryClient.getQueryData<Task[]>(tasksKey);
      const previousSessions = queryClient.getQueriesData<SessionSummary[]>({
        queryKey: ['sessions'],
      });

      const toggled = previousTasks?.find((task) => task.id === taskId);
      const delta = toggled?.isDone ? -1 : 1;

      queryClient.setQueryData<Task[]>(tasksKey, (tasks) =>
        tasks?.map((task) => (task.id === taskId ? { ...task, isDone: !task.isDone } : task)),
      );

      queryClient.setQueriesData<SessionSummary[]>({ queryKey: ['sessions'] }, (sessions) =>
        sessions?.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                done: Math.min(session.total, Math.max(0, session.done + delta)),
              }
            : session,
        ),
      );

      return { previousTasks, previousSessions };
    },
    onError: (_error, _taskId, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(tasksKey, context.previousTasks);
      }
      for (const [key, data] of context?.previousSessions ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData<Task[]>(tasksKey, (tasks) =>
        tasks?.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
    },
    onSettled: () => {
      // Stale-marked, not refetched: the cache is already correct.
      void queryClient.invalidateQueries({ queryKey: ['sessions'], refetchType: 'none' });
      void queryClient.invalidateQueries({
        queryKey: ['session', sessionId],
        refetchType: 'none',
      });
    },
  });
}

export function useDeleteTask(sessionId: string) {
  const queryClient = useQueryClient();
  const tasksKey = queryKeys.tasks(sessionId);

  return useMutation({
    mutationFn: (taskId: string) => tasksRepo.remove(taskId),
    onMutate: async (taskId): Promise<ToggleContext> => {
      await queryClient.cancelQueries({ queryKey: tasksKey });

      const previousTasks = queryClient.getQueryData<Task[]>(tasksKey);
      const previousSessions = queryClient.getQueriesData<SessionSummary[]>({
        queryKey: ['sessions'],
      });

      const removed = previousTasks?.find((task) => task.id === taskId);
      const doneDelta = removed?.isDone ? -1 : 0;

      queryClient.setQueryData<Task[]>(tasksKey, (tasks) =>
        tasks?.filter((task) => task.id !== taskId),
      );

      queryClient.setQueriesData<SessionSummary[]>({ queryKey: ['sessions'] }, (sessions) =>
        sessions?.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                total: Math.max(0, session.total - 1),
                done: Math.max(0, session.done + doneDelta),
              }
            : session,
        ),
      );

      return { previousTasks, previousSessions };
    },
    onError: (_error, _taskId, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(tasksKey, context.previousTasks);
      }
      for (const [key, data] of context?.previousSessions ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'], refetchType: 'none' });
      void queryClient.invalidateQueries({
        queryKey: ['session', sessionId],
        refetchType: 'none',
      });
    },
  });
}

export function useBulkDeleteTasks(sessionId: string) {
  const queryClient = useQueryClient();
  const tasksKey = queryKeys.tasks(sessionId);

  return useMutation({
    mutationFn: (taskIds: string[]) =>
      Promise.all(taskIds.map((taskId) => tasksRepo.remove(taskId))),
    onMutate: async (taskIds): Promise<ToggleContext> => {
      await queryClient.cancelQueries({ queryKey: tasksKey });

      const previousTasks = queryClient.getQueryData<Task[]>(tasksKey);
      const previousSessions = queryClient.getQueriesData<SessionSummary[]>({
        queryKey: ['sessions'],
      });
      const selected = new Set(taskIds);

      queryClient.setQueryData<Task[]>(tasksKey, (tasks) =>
        tasks?.filter((task) => !selected.has(task.id)),
      );

      queryClient.setQueriesData<SessionSummary[]>({ queryKey: ['sessions'] }, (sessions) =>
        sessions?.map((session) => {
          if (session.id !== sessionId) return session;

          const removedTasks = (previousTasks ?? []).filter((task) => selected.has(task.id));
          const doneDelta = removedTasks.filter((task) => task.isDone).length;

          return {
            ...session,
            total: Math.max(0, session.total - removedTasks.length),
            done: Math.max(0, session.done - doneDelta),
          };
        }),
      );

      return { previousTasks, previousSessions };
    },
    onError: (_error, _taskIds, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(tasksKey, context.previousTasks);
      }
      for (const [key, data] of context?.previousSessions ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'], refetchType: 'none' });
      void queryClient.invalidateQueries({
        queryKey: ['session', sessionId],
        refetchType: 'none',
      });
    },
  });
}
