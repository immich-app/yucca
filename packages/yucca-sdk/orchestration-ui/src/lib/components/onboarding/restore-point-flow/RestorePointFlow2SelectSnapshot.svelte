<script lang="ts">
  import type {
    InspectedLocalRepositoryDto,
    SnapshotDto,
  } from "$lib/fetch-client";
  import {
    Button,
    Card,
    CardBody,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
    VStack,
  } from "@immich/ui";

  type Props = {
    onBack: () => void;
    onFinish: () => void;

    repository: InspectedLocalRepositoryDto;
  };

  const { onBack, onFinish, repository }: Props = $props();

  let selectedSnapshot: SnapshotDto | undefined = $state();
</script>

{#if selectedSnapshot}
  test
{:else}
  <Modal
    title={`Restore from ${repository.name}`}
    size="small"
    onClose={onBack}
  >
    <ModalBody>
      <VStack>
        {#each repository.snapshots.toSorted((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()) as snapshot (snapshot.id)}
          <Card>
            <CardBody>
              <HStack>
                <Stack gap={0} class="flex-1">
                  <Text>{new Date(snapshot.time).toLocaleString()}</Text>
                  {#each snapshot.paths as path}
                    <Text color="muted">{path}</Text>
                  {/each}
                </Stack>
                <Button onclick={() => (selectedSnapshot = snapshot)}>
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
        <Button variant="ghost" onclick={onBack}>Back</Button>
      </HStack>
    </ModalFooter>
  </Modal>
{/if}
