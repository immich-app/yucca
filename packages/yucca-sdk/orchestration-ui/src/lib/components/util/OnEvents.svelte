<script lang="ts">
  import { events, SocketEvent } from "$lib/events";
  import { onDestroy, onMount } from "svelte";

  type Props = {
    [key: `on${string}`]: (event: SocketEvent<any>) => void;
  };

  const props: Props = $props();

  onMount(() => {
    for (const key of Object.keys(props)) {
      events.addEventListener(
        key.slice(2),
        props[key as `on${string}`] as (event: Event) => void,
      );
    }
  });

  onDestroy(() => {
    for (const key of Object.keys(props)) {
      events.removeEventListener(
        key.slice(2),
        props[key as `on${string}`] as (event: Event) => void,
      );
    }
  });
</script>
