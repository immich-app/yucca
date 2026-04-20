<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { SocketEvent } from "$lib/events";
  import { createLogObserver } from "$lib/services/log.service.svelte";
  import { Modal, ModalBody, ProgressBar, Stack, Text } from "@immich/ui";
  import { onDestroy } from "svelte";

  type Props = {
    onFinish: () => void;

    taskId: string;
    logId: string;
  };

  const { onFinish, taskId, logId }: Props = $props();

  // svelte-ignore state_referenced_locally
  const log = createLogObserver(logId);
  onDestroy(() => log.destroy());

  const onTaskEnd = (event: SocketEvent<{ parentId: string }>) => {
    if (event.data.parentId === taskId) {
      onFinish();
    }
  };
</script>

<OnEvents {onTaskEnd} />

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
