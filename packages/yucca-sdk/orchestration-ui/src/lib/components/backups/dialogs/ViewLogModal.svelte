<script lang="ts">
  import {
    Button,
    Modal,
    ModalBody,
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableHeading,
    TableRow,
    Text,
    VStack,
  } from "@immich/ui";
  import {
    getRunHistory,
    type LocalRepositoryDto,
    type RunDto,
  } from "$lib/fetch-client";
  import { onDestroy, onMount } from "svelte";

  interface Props {
    logId: string;
    onClose: () => void;
  }

  let { logId, onClose }: Props = $props();

  let events: {
    message_type: string; /* todo: expose type from restic-wrapper */
  }[] = $state([]);
  let source: EventSource;

  onMount(() => {
    source = new EventSource(
      "http://localhost:22676/api/repository/logs/" + logId,
    );

    source.addEventListener("message", ({ data }) => {
      events.push(JSON.parse(data));
    });
  });

  onDestroy(() => source.close());
</script>

<Modal title="todo" size="giant" {onClose}>
  <ModalBody>
    <VStack>
      <Text>{events.length} events streamed</Text>

      {#each events as event}
        <Text
          >{event.message_type}
          <small>{JSON.stringify(event).slice(0, 128)}</small></Text
        >
      {/each}
    </VStack>
  </ModalBody>
</Modal>
