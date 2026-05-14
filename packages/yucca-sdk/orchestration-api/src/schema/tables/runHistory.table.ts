import { TaskStatus, TaskType } from '../../enum';

export type RunType = TaskType.Backup | TaskType.Restore;

export class RunHistoryTable {
  id!: string;
  repositoryId!: string;

  start!: string;
  end?: string;

  logFilePath!: string;
  status!: TaskStatus;
  type!: RunType;
}
