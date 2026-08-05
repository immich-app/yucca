<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListOption from "$lib/components/ui/StackListOption.svelte";
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
  import { mdiHarddisk, mdiShieldCheck } from "@mdi/js";

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
      <StackListOption title="FUTO Backups" onclick={onFutoBackups}>
        {#snippet icon()}
          <Icon icon={mdiShieldCheck} />
        {/snippet}

        Simple, hosted backups.
      </StackListOption>
      <StackListOption title="Local Storage" onclick={onLocalBackups}>
        {#snippet icon()}
          <Icon icon={mdiHarddisk} />
        {/snippet}

        A folder on this computer.
      </StackListOption>
    </StackList>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
