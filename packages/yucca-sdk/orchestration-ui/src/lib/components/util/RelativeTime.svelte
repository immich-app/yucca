<script lang="ts">
  import { DateTime } from "luxon";
  import { onDestroy, onMount } from "svelte";

  type Props = {
    time: string;
  };

  const props: Props = $props();

  const format = () => {
    const time = DateTime.fromISO(props.time);
    return DateTime.now().diff(time).as('minute') < 1 ? "a moment ago" : time.toRelative();
  };

  let text = $state(format());

  let interval: ReturnType<typeof setInterval>;

  onMount(() => (interval = setInterval(() => (text = format()), 1000)));
  onDestroy(() => clearInterval(interval));
</script>

{text}
