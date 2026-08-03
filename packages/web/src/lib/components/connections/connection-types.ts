import { mdiFolderNetwork, mdiImageMultiple } from '@mdi/js';

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
    type: 'restic',
    label: 'Restic',
    icon: mdiFolderNetwork,
    description:
      'Back up any files with restic. Create a repository and get a URL to point restic at.',
    limitation:
      'No client telemetry; we only see stored size, not backup runs.',
    addable: true,
  },
];
