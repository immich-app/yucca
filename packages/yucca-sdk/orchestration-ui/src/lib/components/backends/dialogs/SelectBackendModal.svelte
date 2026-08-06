<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListOption from "$lib/components/ui/StackListOption.svelte";
  import Suspense from "$lib/components/util/Suspense.svelte";
  import {
    handleSetupLocalStorage,
    handleStartYuccaLogin,
    useBackends,
  } from "$lib/services/backend.service";
  import {
    Button,
    HStack,
    Icon,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
  } from "@immich/ui";
  import { mdiHarddisk, mdiShieldCheck } from "@mdi/js";
  import type { Snippet } from "svelte";

  type Props = {
    title?: string;
    leadingContent?: Snippet;
    disabled?: boolean;
    onSelect: (backendId: string) => void;
    onCancel: () => void;
  };

  const {
    title,
    leadingContent,
    disabled = false,
    onSelect,
    onCancel,
  }: Props = $props();

  const backends = useBackends();

  const onFutoBackups = () => {
    const futoBackend = backends.data!.find(
      (backend) => backend.type === "yucca" && backend.isOnline,
    );

    if (futoBackend) {
      onSelect(futoBackend.id);
    } else {
      handleStartYuccaLogin(onSelect);
    }
  };

  const onLocalBackups = () => {
    handleSetupLocalStorage(onSelect);
    onCancel();
  };
</script>

<Modal size="small" {title} onClose={onCancel} icon={false}>
  <ModalBody>
    <Stack>
      {@render leadingContent?.()}

      <StackList>
        <StackListOption
          {disabled}
          title="FUTO Backups"
          onclick={onFutoBackups}
        >
          {#snippet icon()}
            <Icon icon={mdiShieldCheck} />
          {/snippet}

          Simple, hosted backups.
        </StackListOption>
        <StackListOption
          {disabled}
          title="Local Storage"
          onclick={onLocalBackups}
        >
          {#snippet icon()}
            <Icon icon={mdiHarddisk} />
          {/snippet}

          A folder on this computer.
        </StackListOption>

        <Suspense query={backends}>
          {#snippet children(available)}
            {#each available as backend (backend.id)}
              {#if backend.type === "local"}
                <StackListOption
                  {disabled}
                  title="Existing Local Storage"
                  onclick={() => {
                    onSelect(backend.id);
                  }}
                >
                  {#snippet icon()}
                    <Icon icon={mdiHarddisk} />
                  {/snippet}

                  {backend.description}
                </StackListOption>
              {/if}
            {/each}
          {/snippet}
        </Suspense>
      </StackList>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button variant="ghost" {disabled} onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
