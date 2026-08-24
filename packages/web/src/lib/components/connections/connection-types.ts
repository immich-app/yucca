import { mdiImageMultiple, mdiServer } from '@mdi/js';

export type ConnectionTypeMeta = {
  type: string;
  label: string;
  icon: string;
  description: string;
  limitation: string;
  addable: boolean;
};

export const CONNECTION_TYPES: ConnectionTypeMeta[] = [
  {
    type: 'immich',
    label: 'Immich',
    icon: mdiImageMultiple,
    description: 'Back up an Immich instance: photos, videos and the database.',
    limitation:
      'Added automatically when you connect FUTO Backups from the Immich app; not created here.',
    addable: false,
  },
  {
    type: 'standalone',
    label: 'Standalone',
    icon: mdiServer,
    description: 'Back up files from a machine running the standalone FUTO Backups app.',
    limitation:
      'Added automatically when you connect FUTO Backups from the standalone app; not created here.',
    addable: false,
  },
];
