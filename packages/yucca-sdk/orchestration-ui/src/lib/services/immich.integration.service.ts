import ImmichConfigureBackup from '$lib/components/integrations/immich/ImmichConfigureBackup.svelte';
import BackupsRecoveryKeyModal from '$lib/components/onboarding/dialogs/BackupsRecoveryKeyModal.svelte';
import { modalManager, type ActionItem } from '@immich/ui';
import { mdiCloudUploadOutline, mdiCogOutline, mdiKeyOutline } from '@mdi/js';
import { handleCreateBackup } from './repository.service';

export const getBackupPageActions = (repositoryId?: string) => {
  const Configure: ActionItem = {
    title: 'Configure',
    icon: mdiCogOutline,
    onAction: () => modalManager.show(ImmichConfigureBackup, {}),
  };

  const ViewRecoveryKey: ActionItem = {
    title: 'View recovery key',
    icon: mdiKeyOutline,
    onAction: () => void modalManager.show(BackupsRecoveryKeyModal, {}),
  };

  const BackUpNow: ActionItem = {
    title: 'Back up now',
    icon: mdiCloudUploadOutline,
    onAction: () => void handleCreateBackup(repositoryId!),
    $if: () => typeof repositoryId === 'string',
  };

  return { Configure, ViewRecoveryKey, BackUpNow };
};
