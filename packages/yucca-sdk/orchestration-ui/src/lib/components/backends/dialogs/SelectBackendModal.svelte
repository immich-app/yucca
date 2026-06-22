<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import Suspense from "$lib/components/util/Suspense.svelte";
  import {
    handleSetupLocalStorage,
    useBackends,
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
  const yuccaLogin = useYuccaLogin();

  const onFutoBackups = () => {
    const futoBackend = backends.data!.find(
      (backend) => backend.type === "yucca" && backend.isOnline,
    );

    if (futoBackend) {
      onSelect(futoBackend.id);
    } else {
      yuccaLogin.mutate(onSelect);
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

      <Suspense query={backends}>
        <StackList>
          <StackListItem disabled={disabled || yuccaLogin.isPending} onclick={onFutoBackups}>
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
          <StackListItem disabled={disabled || yuccaLogin.isPending} onclick={onLocalBackups}>
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

          {#each backends.data as backend}
            {#if backend.type === "local"}
              <StackListItem
                disabled={disabled || yuccaLogin.isPending}
                onclick={() => {
                  onSelect(backend.id);
                }}
              >
                {#snippet icon()}
                  <Icon icon={mdiHarddisk} size="36px" />
                {/snippet}

                <Stack gap={0}>
                  <Text class="font-bold">Existing Local Storage</Text>
                  <Text>{backend.description}</Text>
                </Stack>

                {#snippet trailing()}
                  <Icon icon={mdiChevronRight} />
                {/snippet}
              </StackListItem>
            {/if}
          {/each}
        </StackList>
      </Suspense>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button variant="ghost" {disabled} onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
