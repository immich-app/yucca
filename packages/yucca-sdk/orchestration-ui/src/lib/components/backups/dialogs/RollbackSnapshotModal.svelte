<script lang="ts">
  import { useRollbackSnapshot } from "$lib/services/snapshot.service";
  import {
    Button,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    repository: string;
    snapshot: string;
    onClose: () => void;
  };

  const { repository, snapshot, onClose }: Props = $props();

  const mutation = useRollbackSnapshot();

  const onConfirm = () =>
    mutation.mutate(
      { repositoryId: repository, snapshotId: snapshot },
      { onSuccess: () => onClose() },
    );
</script>

<Modal title={$t`Rollback to this snapshot?`} size="small" {onClose}>
  <ModalBody>
    <Stack gap={4}>
      <Text>
        {$t`Your instance will return to how it was when this snapshot was taken.`}
      </Text>

      <Stack gap={2}>
        <Text>{$t`This will:`}</Text>
        <ul class="list-disc ps-6">
          <li><Text>{$t`Restore files from the snapshot`}</Text></li>
          <li><Text>{$t`Restore the Immich database`}</Text></li>
          <li><Text>{$t`Restart the server during rollback`}</Text></li>
        </ul>
      </Stack>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button color="danger" loading={mutation.isPending} onclick={onConfirm}>
        {$t`Confirm rollback`}
      </Button>
      <Button variant="ghost" onclick={onClose}>{$t`Cancel`}</Button>
    </HStack>
  </ModalFooter>
</Modal>
