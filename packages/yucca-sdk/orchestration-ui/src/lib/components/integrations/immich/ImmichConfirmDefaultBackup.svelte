<script lang="ts">
  import { useConfigureImmichDefaults } from "$lib/services/integrations.service";
  import {
    Button,
    HStack,
    Icon,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import {
    mdiClockOutline,
    mdiFolderMultipleOutline,
    mdiImageMultipleOutline,
  } from "@mdi/js";

  type Props = {
    onCustomize: () => void;
    onConfirm: () => void;
    onCancel: () => void;
  };

  const { onCustomize, onConfirm, onCancel }: Props = $props();

  const mutation = useConfigureImmichDefaults();

  const onCreate = () =>
    mutation.mutate(undefined, { onSuccess: () => onConfirm() });
</script>

<Modal title="Ready to back up Immich" size="small" onClose={onCancel}>
  <ModalBody>
    <Stack gap={3}>
      <Text>
        We'll create a backup with sensible defaults. You can change anything
        later from the Immich backups page.
      </Text>

      <Stack>
        <HStack>
          <Icon
            icon={mdiImageMultipleOutline}
            class="shrink-0 place-self-start mt-1"
          />
          <Text>Photos, videos, database, and configuration</Text>
        </HStack>
        <HStack>
          <Icon
            icon={mdiFolderMultipleOutline}
            class="shrink-0 place-self-start mt-1"
          />
          <Text>All external libraries</Text>
        </HStack>
        <HStack>
          <Icon
            icon={mdiClockOutline}
            class="shrink-0 place-self-start mt-1"
          />
          <Text>Runs every day at 3:00 AM</Text>
        </HStack>
      </Stack>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack gap={2}>
      <Button
        variant="ghost"
        onclick={onCustomize}
        disabled={mutation.isPending}
      >
        Customize
      </Button>
      <Button onclick={onCreate} loading={mutation.isPending}>
        Create backup
      </Button>
    </HStack>
  </ModalFooter>
</Modal>
