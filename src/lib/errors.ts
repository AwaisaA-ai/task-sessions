const IPC_PREFIX = /^Error invoking remote method '[^']+':\s*(Error:\s*)?/;

/** Turns an IPC rejection into something a user can read. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(IPC_PREFIX, '') || 'Something went wrong.';
  }
  if (typeof error === 'string') return error.replace(IPC_PREFIX, '');
  return 'Something went wrong.';
}
