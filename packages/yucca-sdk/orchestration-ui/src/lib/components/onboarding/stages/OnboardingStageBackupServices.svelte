<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import {
    handleSetupLocalStorage,
    useYuccaLogin,
  } from "$lib/services/backend.service";
  import {
    Button,
    HStack,
    Icon,
    LoadingSpinner,
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

  const yuccaLogin = useYuccaLogin();

  function onFutoBackups() {
    yuccaLogin.mutate(onNext);
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
      <StackListItem disabled={yuccaLogin.isPending} onclick={onFutoBackups}>
        {#snippet icon()}
          <Icon icon={mdiShieldCheck} size="36px" />
        {/snippet}

        <Stack gap={0}>
          <Text class="font-bold">FUTO Backups</Text>
          <Text>Simple, hosted backups.</Text>
        </Stack>

        {#snippet trailing()}
          {#if yuccaLogin.isPending}
            <LoadingSpinner />
          {:else}
            <Icon icon={mdiChevronRight} />
          {/if}
        {/snippet}
      </StackListItem>
      <StackListItem disabled={yuccaLogin.isPending} onclick={onLocalBackups}>
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
