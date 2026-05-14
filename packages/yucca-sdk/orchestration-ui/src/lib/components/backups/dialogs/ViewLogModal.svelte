<script lang="ts">
  import {
    Alert,
    Heading,
    Modal,
    ModalBody,
    ProgressBar,
    Scrollable,
    Stack,
    Text,
  } from "@immich/ui";
  import { onDestroy } from "svelte";
  import { createLogObserver } from "$lib/services/log.service.svelte";
  import { options } from "$lib/options";

  type Props = {
    logId: string;
    onClose: () => void;
  };

  let { logId, onClose }: Props = $props();

  const advanced = options.advanced;
  // svelte-ignore state_referenced_locally
  const log = createLogObserver(logId);

  onDestroy(() => log.destroy());
</script>

<Modal title="Log Output" size="giant" {onClose}>
  <ModalBody>
    <Stack gap={2}>
      {#each log.errors as error}
        <Alert color="danger">{error}</Alert>
      {/each}

      <ProgressBar progress={log.status.progress} size="large">
        <Text
          size="small"
          class={log.status.progress > 0.5 ? "text-light" : "text-dark"}
        >
          {#if log.status.progress >= 1}
            {log.errors.length > 0 ? "Completed with errors" : "Complete"}
          {:else}
            {log.status.text}
          {/if}
        </Text>
      </ProgressBar>

      {#if log.status.currentFiles.length > 0}
        <Stack gap={1}>
          {#each log.status.currentFiles as file}
            <Text size="tiny" class="text-nowrap">{file}</Text>
          {/each}
        </Stack>
      {/if}

      {#if $advanced}
        <Heading size="small">Event Log</Heading>
        <Scrollable class="h-80 overflow-x-hidden">
          <Stack gap={1}>
            {#each log.events as event}
              <Text size="tiny" class="font-mono select-all"
                >{JSON.stringify(event)}</Text
              >
            {/each}
          </Stack>
        </Scrollable>
      {/if}
    </Stack>
  </ModalBody>
</Modal>
