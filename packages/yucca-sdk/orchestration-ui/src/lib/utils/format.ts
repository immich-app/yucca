import { Duration } from 'luxon';
import { gt, msg } from 'svelte-i18n-lingui';

export const formatDuration = (
  ms: number,
  unitDisplay: 'narrow' | 'long' = 'narrow',
) => {
  const seconds = Math.round(ms / 1000);

  return seconds < 1
    ? '<1s'
    : Duration.fromMillis(seconds * 1000)
        .rescale()
        .toHuman({ unitDisplay });
};

const IMMICH_FOLDER_LABELS: Record<string, string> = {
  upload: msg`Photos and videos`,
  profile: msg`Photos and videos`,
  library: msg`Photos and videos`,
  backups: msg`Database backups`,
  thumbs: msg`Thumbnails and previews`,
  'encoded-video': msg`Encoded videos`,
};

export const humanizeBackupPath = (path: string): string => {
  if (path.includes('yucca')) {
    return gt`Backup configuration`;
  }

  const basename = path.replace(/\/+$/, '').split('/').pop() ?? path;
  const label = IMMICH_FOLDER_LABELS[basename];
  return label ? gt(label) : basename;
};
