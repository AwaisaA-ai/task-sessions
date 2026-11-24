import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthCredentials, SyncConfigInput } from '../../shared/types';
import { getApi } from './client';

export const syncKeys = {
  status: ['sync', 'status'] as const,
};

export function useSyncStatus() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: syncKeys.status,
    queryFn: () => getApi().syncStatus(),
  });

  useEffect(() => {
    const unsubscribe = getApi().onSyncStatus((status) => {
      queryClient.setQueryData(syncKeys.status, status);
    });
    return unsubscribe;
  }, [queryClient]);

  return query;
}

export function useSyncConfigure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SyncConfigInput) => getApi().syncConfigure(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: syncKeys.status });
    },
  });
}

export function useSyncSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AuthCredentials) => getApi().syncSignIn(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: syncKeys.status });
    },
  });
}

export function useSyncSignUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AuthCredentials) => getApi().syncSignUp(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: syncKeys.status });
    },
  });
}

export function useSyncSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => getApi().syncSignOut(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: syncKeys.status });
    },
  });
}

export function useSyncRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => getApi().syncRun(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: syncKeys.status });
    },
  });
}

/**
 * After any successful write the next sync round is scheduled. The actual
 * round happens through the manager in the main process (debounced).
 */
export function useAutoSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.mutation?.state.status === 'success') {
        void getApi().syncSchedule();
      }
    });

    return unsubscribe;
  }, [queryClient]);
}
