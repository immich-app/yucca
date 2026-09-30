<script lang="ts">
  import type {
    InspectedLocalRepositoryDto,
    SnapshotDto,
  } from "$lib/fetch-client";
  import { handleRestoreFromPoint } from "$lib/services/snapshot.service";
  import {
    Button,
    Checkbox,
    Field,
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
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onBack: () => void;
    onFinish: () => void;

    repository: InspectedLocalRepositoryDto;
    snapshot: SnapshotDto;
  };

  const { onBack, onFinish, repository, snapshot }: Props = $props();
  const backupIncludesId = $props.id();

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
  <Modal title={$t`Confirm restore from snapshot`} size="small" onClose={onBack}>
    <ModalBody>
      <Stack>
        <Field label={$t`Restore configuration`}>
          <HStack class="items-end">
            <Select
              options={yuccaConfigOptions}
              bind:value={yuccaConfig}
              placeholder={$t`Not restoring backup configuration`}
              class="flex-1"
            />
            {#if yuccaConfig}
              <Button variant="ghost" onclick={() => (yuccaConfig = undefined)}>
                {$t`Clear`}
              </Button>
            {/if}
          </HStack>
        </Field>

        <div role="group" aria-labelledby={backupIncludesId} class="flex flex-col gap-2">
          <Text id={backupIncludesId} fontWeight="bold">{$t`Backup includes`}</Text>
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
        </div>

        <Text size="small" color="muted">
          {$t`Files will be restored to their exact paths.`}
        </Text>
      </Stack>
    </ModalBody>
    <ModalFooter>
      <HStack>
        <Button variant="ghost" onclick={onBack}>{$t`Back`}</Button>
        <Button onclick={handleRestore}>{$t`Restore`}</Button>
      </HStack>
    </ModalFooter>
  </Modal>
{/if}
