<script lang="ts">
  import type {
    InspectedLocalRepositoryDto,
    SnapshotDto,
  } from "$lib/fetch-client";
  import { handleRestoreFromPoint } from "$lib/services/snapshot.service";
  import {
    Button,
    Checkbox,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Select,
    Stack,
    Text,
  } from "@immich/ui";
  import { SvelteSet } from "svelte/reactivity";
  import RestorePointFlow4Restore from "./RestorePointFlow4Restore.svelte";

  type Props = {
    onBack: () => void;
    onFinish: () => void;

    repository: InspectedLocalRepositoryDto;
    snapshot: SnapshotDto;
  };

  const { onBack, onFinish, repository, snapshot }: Props = $props();

  const yuccaConfigOptions = $derived(
    snapshot.paths
      .filter((path) => path.includes("yucca"))
      .map((value) => ({
        value,
        label: value,
      })),
  );

  // svelte-ignore state_referenced_locally
  let yuccaConfig: string | undefined = $state(
    snapshot.paths.find((path) => path.includes("yucca")),
  );

  // svelte-ignore state_referenced_locally
  let includePaths = new SvelteSet<string>(
    snapshot.paths.filter((path) => !path.includes("yucca")),
  );

  let logId: string | undefined = $state();

  async function handleRestore() {
    ({ logId } = await handleRestoreFromPoint(
      repository.id,
      snapshot.id,
      repository.backends!.primary.id,
      {
        yuccaConfig,
        include: [...includePaths].filter((path) => path !== yuccaConfig),
      },
    ));
  }
</script>

{#if logId}
  <RestorePointFlow4Restore {onFinish} {logId} taskId={repository.id} />
{:else}
  <Modal title="Confirm restore from snapshot" size="small" onClose={onBack}>
    <ModalBody>
      <Stack>
        <Stack gap={2}>
          <Text fontWeight="bold">Restore configuration</Text>
          <HStack>
            <Select
              options={yuccaConfigOptions}
              bind:value={yuccaConfig}
              placeholder="Not restoring backup configuration"
              class="flex-1"
            />
            {#if yuccaConfig}
              <Button variant="ghost" onclick={() => (yuccaConfig = undefined)}>
                Clear
              </Button>
            {/if}
          </HStack>
        </Stack>

        <Stack gap={2}>
          <Text fontWeight="bold">Backup includes</Text>
          {#each snapshot.paths as path}
            {@const forced = path === yuccaConfig}
            <label class="select-none flex gap-2 items-center">
              <Checkbox
                checked={forced || includePaths.has(path)}
                disabled={forced}
                onCheckedChange={() =>
                  includePaths.has(path)
                    ? includePaths.delete(path)
                    : includePaths.add(path)}
              />
              {path}
            </label>
          {/each}
        </Stack>

        <Text size="small" color="muted">
          Files will be restored to their exact paths.
        </Text>
      </Stack>
    </ModalBody>
    <ModalFooter>
      <HStack>
        <Button variant="ghost" onclick={onBack}>Back</Button>
        <Button onclick={handleRestore}>Restore</Button>
      </HStack>
    </ModalFooter>
  </Modal>
{/if}
