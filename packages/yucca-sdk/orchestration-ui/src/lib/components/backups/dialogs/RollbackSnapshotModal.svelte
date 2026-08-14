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

<Modal title="Rollback to this snapshot?" size="small" {onClose}>
  <ModalBody>
    <Stack gap={4}>
      <Text>
        Your instance will return to how it was when this snapshot was taken.
      </Text>

      <Stack gap={2}>
        <Text>This will:</Text>
        <ul class="list-disc ps-6">
          <li><Text>Restore files from the snapshot</Text></li>
          <li><Text>Restore the Immich database</Text></li>
          <li><Text>Restart the server during rollback</Text></li>
        </ul>
      </Stack>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button color="danger" loading={mutation.isPending} onclick={onConfirm}>
        Confirm rollback
      </Button>
      <Button variant="ghost" onclick={onClose}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
