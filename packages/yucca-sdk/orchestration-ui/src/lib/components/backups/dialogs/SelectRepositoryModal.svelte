<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import { useInspectRepositories } from "$lib/services/repository.service";
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
  import { mdiChevronRight } from "@mdi/js";
  import type { Snippet } from "svelte";

  type Props = {
    title?: string;
    backendId?: string;

    leadingContent?: Snippet;
    footerContent?: Snippet;

    onSelect: (repositoryId: string) => void;
    onCancel: () => void;
  };

  const {
    title = "Select Backup",
    backendId,
    leadingContent,
    footerContent,
    onSelect,
    onCancel,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useInspectRepositories(backendId);

  const sortedRepositories = $derived(
    query.data?.toSorted((a, b) => {
      const validA = a.snapshots !== undefined;
      const validB = b.snapshots !== undefined;
      return validA !== validB
        ? Number(validB) - Number(validA)
        : Number(b.name.includes("Immich")) - Number(a.name.includes("Immich"));
    }),
  );
</script>

<Modal {title} size="small" onClose={onCancel}>
  <ModalBody>
    <Stack>
      {@render leadingContent?.()}

      <StackList {query}>
        {#each sortedRepositories ?? [] as repository (repository.id)}
          {@const accessible = repository.snapshots !== undefined}

          <StackListItem
            title={repository.name}
            color={accessible ? "primary" : "danger"}
            onclick={accessible ? () => onSelect(repository.id) : undefined}
          >
            {#if !accessible}
              Can't access, is your recovery key correct?
            {:else if repository.snapshots.length}
              Last backup: {new Date(
                repository.snapshots[0].time,
              ).toLocaleDateString()}
            {:else}
              No backups yet
            {/if}

            {#snippet trailing()}
              {#if accessible}
                <Icon icon={mdiChevronRight} />
              {/if}
            {/snippet}
          </StackListItem>
        {/each}

        {#if (sortedRepositories ?? []).length === 0}
          <StackListItem>
            <Text color="muted">No backups found.</Text>
          </StackListItem>
        {/if}
      </StackList>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
      {@render footerContent?.()}
    </HStack>
  </ModalFooter>
</Modal>
