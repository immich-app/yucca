<script lang="ts">
  import {
    Button,
    Card,
    CardBody,
    Checkbox,
    Heading,
    HStack,
    Modal,
    Select,
    Stack,
    ModalBody,
    ModalFooter,
    Text,
    VStack,
    Alert,
    LoadingSpinner,
    ProgressBar,
  } from "@immich/ui";
  import { SvelteSet } from "svelte/reactivity";
  import { onDestroy } from "svelte";
  import { useInspectRepositories } from "$lib/services/repository.service";
  import { handleRestoreFromPoint } from "$lib/services/snapshot.service";
  import { createLogObserver } from "$lib/services/log.service.svelte";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import type { SnapshotDto } from "$lib/fetch-client";

  type Props = {
    onCancel: () => void;
    onImportKey: () => void;
    onFinish: () => void;
  };

  const { onCancel, onImportKey, onFinish }: Props = $props();

  let selectedRepository: string | undefined = $state();
  let selectedSnapshot: SnapshotDto | undefined = $state();
  let yuccaConfigPath: string | undefined = $state();
  let includePaths = $state(new SvelteSet<string>());

  const query = useInspectRepositories();

  const sorted = $derived(
    query.data?.toSorted((a, b) => {
      const validA = a.snapshots !== undefined;
      const validB = b.snapshots !== undefined;
      return validA !== validB
        ? Number(validB) - Number(validA)
        : Number(b.name.includes("Immich")) - Number(a.name.includes("Immich"));
    }),
  );

  const target = $derived(
    query.data?.find((repository) => {
      return repository.id === selectedRepository;
    }),
  );

  const yuccaConfigOptions = $derived(
    selectedSnapshot?.paths
      .filter((path) => {
        return path.toLowerCase().includes("yucca");
      })
      .map((path) => {
        return { label: path, value: path };
      }) ?? [],
  );

  function selectSnapshot(snapshot: SnapshotDto) {
    selectedSnapshot = snapshot;
    includePaths = new SvelteSet(snapshot.paths);

    const yuccaMatch = snapshot.paths.find((path) => {
      return path.toLowerCase().includes("yucca");
    });

    yuccaConfigPath = yuccaMatch;
  }

  let log: ReturnType<typeof createLogObserver> | undefined = $state();

  onDestroy(() => log?.destroy());

  $effect(() => {
    if (log?.status.finished) {
      onFinish();
    }
  });

  async function handleRestore() {
    const { logId } = await handleRestoreFromPoint(
      selectedRepository!,
      selectedSnapshot!.id,
      target!.backends!.primary.id,
      {
        yuccaConfig: yuccaConfigPath,
        include: [...includePaths],
      },
    );

    log = createLogObserver(logId);
  }

  function togglePath(path: string) {
    if (path === yuccaConfigPath) {
      return;
    }

    if (includePaths.has(path)) {
      includePaths.delete(path);
    } else {
      includePaths.add(path);
    }
  }
</script>

{#if log}
  <Modal title="Restoring" size="small">
    <ModalBody>
      <Stack gap={2}>
        <ProgressBar progress={log.status.progress} size="large">
          <Text
            size="small"
            class={log.status.progress > 0.5 ? "text-light" : "text-dark"}
          >
            {log.status.text}
          </Text>
        </ProgressBar>

        {#if log.status.currentFiles.length > 0}
          <Stack gap={1}>
            {#each log.status.currentFiles as file}
              <Text size="tiny" class="text-nowrap">{file}</Text>
            {/each}
          </Stack>
        {/if}
      </Stack>
    </ModalBody>
  </Modal>
{:else if selectedSnapshot}
  <Modal
    title="Confirm restore from snapshot"
    size="small"
    onClose={() => (selectedSnapshot = undefined)}
  >
    <ModalBody>
      <Stack>
        <Stack gap={2}>
          <Text fontWeight="bold">Restore configuration</Text>
          <HStack>
            <Select
              options={yuccaConfigOptions}
              bind:value={yuccaConfigPath}
              placeholder="Not restoring backup configuration"
              class="flex-1"
            />
            {#if yuccaConfigPath}
              <Button
                variant="ghost"
                onclick={() => (yuccaConfigPath = undefined)}
              >
                Clear
              </Button>
            {/if}
          </HStack>
        </Stack>

        <Stack gap={2}>
          <Text fontWeight="bold">Backup includes</Text>
          {#each selectedSnapshot.paths as path}
            {@const forced = path === yuccaConfigPath}
            <label class="select-none flex gap-2 items-center">
              <Checkbox
                checked={forced || includePaths.has(path)}
                disabled={forced}
                onCheckedChange={() => togglePath(path)}
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
        <Button variant="ghost" onclick={() => (selectedSnapshot = undefined)}
          >Back</Button
        >
        <Button onclick={handleRestore}>Restore</Button>
      </HStack>
    </ModalFooter>
  </Modal>
{:else if selectedRepository && target}
  <Modal
    title={`Restore from ${target.name}`}
    size="small"
    onClose={() => (selectedRepository = undefined)}
  >
    <ModalBody>
      <VStack>
        {#each target.snapshots.toSorted((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()) as snapshot (snapshot.id)}
          <Card>
            <CardBody>
              <HStack>
                <Stack gap={0} class="flex-1">
                  <Text>{new Date(snapshot.time).toLocaleString()}</Text>
                  {#each snapshot.paths as path}
                    <Text color="muted">{path}</Text>
                  {/each}
                </Stack>
                <Button onclick={() => selectSnapshot(snapshot)}>
                  Restore
                </Button>
              </HStack>
            </CardBody>
          </Card>
        {/each}
      </VStack>
    </ModalBody>
    <ModalFooter>
      <HStack>
        <Button variant="ghost" onclick={() => (selectedRepository = undefined)}
          >Back</Button
        >
      </HStack>
    </ModalFooter>
  </Modal>
{:else}
  <Modal title="Select Restore Point" size="small" onClose={onCancel}>
    <ModalBody>
      <VStack>
        {#if query.isPending}
          <LoadingSpinner />
        {:else if query.isError}
          <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
        {:else if query.isSuccess && sorted?.length}
          {#each sorted as repo (repo.id)}
            {@const accessible = repo.snapshots !== undefined}
            <Card class={accessible ? "" : "opacity-50"}>
              <CardBody>
                <HStack>
                  <Stack gap={0} class="flex-1">
                    <Heading size="small">{repo.name}</Heading>
                    <Text color={!accessible ? "danger" : undefined}>
                      {#if !accessible}
                        Unable to access repository
                      {:else if repo.snapshots.length}
                        Last backup: {new Date(
                          repo.snapshots[0].time,
                        ).toLocaleDateString()}
                      {:else}
                        No backups yet
                      {/if}
                    </Text>
                  </Stack>
                  {#if accessible}
                    <Button onclick={() => (selectedRepository = repo.id)}
                      >Select</Button
                    >
                  {/if}
                </HStack>
              </CardBody>
            </Card>
          {/each}
        {:else}
          <Text>No repositories found.</Text>
        {/if}
      </VStack>
    </ModalBody>
    <ModalFooter>
      <HStack>
        <Button variant="ghost" onclick={onCancel}>Cancel</Button>
        <Button variant="ghost" onclick={onImportKey}
          >Import a different key</Button
        >
      </HStack>
    </ModalFooter>
  </Modal>
{/if}
