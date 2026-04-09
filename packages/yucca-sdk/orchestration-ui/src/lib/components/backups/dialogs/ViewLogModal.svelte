<script lang="ts">
  import {
    Card,
    Heading,
    Modal,
    ModalBody,
    ProgressBar,
    Scrollable,
    Table,
    TableCell,
    TableRow,
    Text,
  } from "@immich/ui";
  import { onDestroy, onMount } from "svelte";
  import debounce from "lodash.debounce";

  // TODO: needs UI refactoring

  type Props = {
    logId: string;
    onClose: () => void;
  };

  type LogEvent =
    | {
        message_type: "summary";
      }
    | {
        message_type: "status";
        percent_done: number;
        seconds_remaining?: number;
        current_files?: string[];
      };

  let { logId, onClose }: Props = $props();

  let events: LogEvent[] = $state([]);
  let eventSlice: LogEvent[] = $state([]);
  let source: EventSource;

  let status = $state({
    progress: 0,
    text: "",
    currentFiles: [] as string[],
  });

  const updateStatus = debounce(
    (data: typeof status) => {
      status = data;
      eventSlice = events.slice();
    },
    50,
    {
      maxWait: 100,
    },
  );

  let onEvent = (event: LogEvent) => {
    events.unshift(event);
    events.splice(50);

    switch (event.message_type) {
      case "status":
        updateStatus({
          progress: event.percent_done,
          text: event.seconds_remaining
            ? `${event.seconds_remaining} seconds remaining`
            : "",
          currentFiles: event.current_files ?? [],
        });
        break;
      case "summary":
        status = {
          progress: 1,
          text: "",
          currentFiles: [],
        };
        break;
    }
  };

  onMount(() => {
    source = new EventSource(
      "http://localhost:22676/api/repository/logs/" + logId,
    );

    source.addEventListener("message", ({ data }) => onEvent(JSON.parse(data)));
  });

  onDestroy(() => source.close());
</script>

<Modal title={`Log Output`} size="giant" {onClose}>
  <ModalBody>
    <ProgressBar progress={status.progress} size="large">
      <Text
        size="small"
        class={status.progress > 0.5 ? "text-light" : "text-dark"}
        >{status.text}</Text
      >
    </ProgressBar>

    <Scrollable class="h-120 py-2 flex flex-col gap-2 overflow-x-hidden">
      {#each status.currentFiles as file}
        <Text size="tiny" class="text-nowrap">{file}</Text>
      {/each}

      <Heading size="small">Event Log</Heading>

      <Table spacing="tiny">
        {#each eventSlice as event}
          <TableRow>
            <TableCell class="w-30">{event.message_type}</TableCell>
            <TableCell class="text-left select-all text-xs"
              >{JSON.stringify(event)}</TableCell
            >
          </TableRow>
        {/each}
      </Table>
    </Scrollable>
  </ModalBody>
</Modal>
