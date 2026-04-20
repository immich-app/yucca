<script lang="ts">
  import { useInspectRepositories } from "$lib/services/repository.service";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import {
    Alert,
    Button,
    Card,
    CardBody,
    Heading,
    HStack,
    LoadingSpinner,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
    VStack,
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
      <VStack>
        {#if query.isPending}
          <LoadingSpinner />
        {:else if query.isError}
          <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
        {:else if query.isSuccess && sortedRepositories?.length}
          {#each sortedRepositories as repo (repo.id)}
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
