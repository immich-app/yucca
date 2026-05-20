import { Writable } from 'node:stream';

type ResticStatusEvent = { message_type: string; percent_done?: number };

export type RetentionPolicy = {
  keepLast?: number;
  keepWithin?: string;
  keepWithinHourly?: string;
  keepWithinDaily?: string;
  keepWithinWeekly?: string;
  keepWithinMonthly?: string;
  keepWithinYearly?: string;
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  keepWithin: '60d',
};

export const createSampledLogWriter = (logStream: Writable | undefined) => {
  let lastAt = 0;
  let lastPercent = -1;

  return (event: ResticStatusEvent) => {
    if (!logStream?.writable) {
      return;
    }

    if (event.message_type === 'status') {
      const percent = event.percent_done ?? 0;
      if (percent < 1 && Date.now() - lastAt < 1000 && Math.abs(percent - lastPercent) < 0.01) {
        return;
      }

      lastAt = Date.now();
      lastPercent = percent;
    }

    logStream.write(JSON.stringify(event) + '\n');
  };
};
