import { Duration } from 'luxon';

export const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000);

  return seconds < 1
    ? '<1s'
    : Duration.fromMillis(seconds * 1000)
        .rescale()
        .toHuman({ unitDisplay: 'narrow' });
};

const IMMICH_FOLDER_LABELS: Record<string, string> = {
  upload: 'Photos and videos',
  profile: 'Photos and videos',
  library: 'Photos and videos',
  backups: 'Database backups',
  thumbs: 'Thumbnails and previews',
  'encoded-video': 'Encoded videos',
};

export const humanizeBackupPath = (path: string): string => {
  if (path.includes('yucca')) {
    return 'Backup configuration';
  }

  const basename = path.replace(/\/+$/, '').split('/').pop() ?? path;
  return IMMICH_FOLDER_LABELS[basename] ?? basename;
};
