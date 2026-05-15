<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import { useInspectRepositories } from "$lib/services/repository.service";
  import {
    Button,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import RestorePointFlow2SelectSnapshot from "./RestorePointFlow2SelectSnapshot.svelte";

  type Props = {
    onCancel: () => void;
    onImportKey: () => void;
    onFinish: () => void;
  };

  const { onCancel, onImportKey, onFinish }: Props = $props();

  const query = useInspectRepositories();

  const sortedRepositories = $derived(
    query.data?.toSorted((a, b) => {
      const validA = a.snapshots !== undefined;
      const validB = b.snapshots !== undefined;
      return validA !== validB
        ? Number(validB) - Number(validA)
        : Number(b.name.includes("Immich")) - Number(a.name.includes("Immich"));
    }),
  );

  let selectedRepository: string | undefined = $state();

  const repository = $derived(
    query.data?.find((repository) => {
      return repository.id === selectedRepository;
    }),
  );
</script>

{#if repository}
  <RestorePointFlow2SelectSnapshot
    onBack={() => (selectedRepository = undefined)}
    {repository}
    {onFinish}
  />
{:else}
  <Modal title="Select Restore Point" size="small" onClose={onCancel}>
    <ModalBody>
      <StackList {query}>
        {#snippet children()}
          {#each sortedRepositories ?? [] as repo (repo.id)}
            {@const accessible = repo.snapshots !== undefined}
            <HStack gap={2} class="px-4 py-3">
              <Stack gap={0} class="grow min-w-0">
                <Text>{repo.name}</Text>
                <Text size="small" color={accessible ? "secondary" : "danger"}>
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
                <Button onclick={() => (selectedRepository = repo.id)}>
                  Select
                </Button>
              {/if}
            </HStack>
          {/each}
          {#if (sortedRepositories ?? []).length === 0}
            <Text class="text-center py-6" color="muted">
              No repositories found.
            </Text>
          {/if}
        {/snippet}
      </StackList>
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
