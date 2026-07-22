<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import {
    handleSetupLocalStorage,
    handleStartYuccaLogin,
  } from "$lib/services/backend.service";
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
  import { mdiChevronRight, mdiHarddisk, mdiShieldCheck } from "@mdi/js";

  type Props = {
    restore?: boolean;
    onNext: (backendId: string) => void;
    onCancel: () => void;
  };

  const { restore = false, onNext, onCancel }: Props = $props();

  function onFutoBackups() {
    handleStartYuccaLogin(onNext);
  }

  function onLocalBackups() {
    handleSetupLocalStorage(onNext);
  }

  // TODO: show existing backends if any configured!
</script>

<Modal
  size="small"
  title={restore ? "Where would you like to restore from?" : "Backup options"}
  onClose={onCancel}
  icon={false}
>
  <ModalBody>
    <StackList>
      <StackListItem onclick={onFutoBackups}>
        {#snippet icon()}
          <Icon icon={mdiShieldCheck} size="36px" />
        {/snippet}

        <Stack gap={0}>
          <Text class="font-bold">FUTO Backups</Text>
          <Text>Simple, hosted backups.</Text>
        </Stack>

        {#snippet trailing()}
          <Icon icon={mdiChevronRight} />
        {/snippet}
      </StackListItem>
      <StackListItem onclick={onLocalBackups}>
        {#snippet icon()}
          <Icon icon={mdiHarddisk} size="36px" />
        {/snippet}

        <Stack gap={0}>
          <Text class="font-bold">Local Storage</Text>
          <Text>A folder on this computer.</Text>
        </Stack>

        {#snippet trailing()}
          <Icon icon={mdiChevronRight} />
        {/snippet}
      </StackListItem>
    </StackList>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
