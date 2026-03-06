export class ScheduleTable {
  id!: string;
  name!: string;
  paused!: number;
  cron!: string;
  ordering!: string;

  lastRun?: string;
  lastFinished?: string;
}
