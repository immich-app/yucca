import { RunHistoryStatus } from '../../enum';

export class RunHistoryTable {
  id!: string;
  repositoryId!: string;

  start!: string;
  end?: string;

  logFilePath!: string;
  status!: RunHistoryStatus;
}
