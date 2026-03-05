export class ScheduleTable {
  id!: string;
  name!: string;
  paused!: boolean;
  cron!: string;
  ordering!: string;

  lastRun?: string;
  lastFinished?: string;
}
