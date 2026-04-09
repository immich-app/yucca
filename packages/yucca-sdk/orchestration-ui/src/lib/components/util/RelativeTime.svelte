<script lang="ts">
  import { DateTime } from "luxon";
  import { onDestroy, onMount } from "svelte";

  type Props = {
    time: string;
  };

  const props: Props = $props();

  const format = () => DateTime.fromISO(props.time).toRelative();

  let text = $state(format());

  let interval: ReturnType<typeof setInterval>;

  onMount(() => (interval = setInterval(() => (text = format()), 1000)));
  onDestroy(() => clearInterval(interval));
</script>

{text}
