<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Button } from "@immich/ui";

  type Props = {
    text: string;
    onclick: () => void;
  };

  let { text, onclick }: Props = $props();

  let time = $state(5);
  let interval: number | undefined;

  onMount(() => {
    interval = setInterval(
      () => {
        if (time === 0) {
          clearInterval(interval);
          return;
        }

        time--;
      },
      import.meta.env.DEV ? 100 : 1000,
    ) as never;
  });

  onDestroy(() => clearInterval(interval));
</script>

<Button {onclick} disabled={time !== 0}
  >{text}
  {#if time !== 0}
    ({time})
  {/if}</Button
>
