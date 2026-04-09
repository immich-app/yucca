import { Duration } from 'luxon';

export const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000);

  return seconds < 1
    ? '<1s'
    : Duration.fromMillis(seconds * 1000)
        .rescale()
        .toHuman({ unitDisplay: 'narrow' });
};
