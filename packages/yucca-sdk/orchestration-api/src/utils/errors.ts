import { ResticBackupCommandCouldNotReadSourceDataError } from '@futo-org/restic-wrapper';
import { WriteStream } from 'node:fs';
import { TaskStatus } from '../enum';

export class TaskCancelledError extends Error {
  constructor() {
    super('Cancelled by user action');
  }
}

export function getTaskStatus(error?: unknown): TaskStatus {
  if (!error) {
    return TaskStatus.Complete;
  }

  if (error instanceof TaskCancelledError) {
    return TaskStatus.Cancelled;
  }

  if (error instanceof ResticBackupCommandCouldNotReadSourceDataError) {
    return TaskStatus.Warn;
  }

  return TaskStatus.Failed;
}

export function writeError(stream: WriteStream, error: unknown) {
  const events = Array.isArray((error as { error?: unknown })?.error)
    ? ((error as { error: unknown[] }).error as object[])
    : [{ message_type: 'error', error: `${error}` }];

  for (const event of events) {
    stream.write(JSON.stringify(event) + '\n');
  }
}
