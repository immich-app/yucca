export class ScheduleTable {
  id!: string;
  cron!: string;
  ordering!: string;

  lastRun?: string;
  lastFinished?: string;
}
