import { Writable } from 'node:stream';

type ResticStatusEvent = { message_type: string; percent_done?: number };

export type RetentionPolicy = {
  keepWithinDaily?: string;
  keepWithinWeekly?: string;
  keepWithinMonthly?: string;
};

export const retentionPolicyForPreset = (preset: `default` | `off`): RetentionPolicy | undefined => {
  switch (preset) {
    case 'default': {
      return {
        keepWithinDaily: '7d',
        keepWithinWeekly: '1m',
        keepWithinMonthly: '1y',
      };
    }
    case 'off': {
      return undefined;
    }
  }
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
