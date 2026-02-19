<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Button, type ButtonProps } from "@immich/ui";

  type Props = ButtonProps & {
    text: string;
  };

  let { text, ...props }: Props = $props();

  let time = $state(5);
  let interval: number | undefined;

  onMount(() => {
    interval = setInterval(() => {
      if (time === 0) {
        clearInterval(interval);
        return;
      }

      time--;
    }, 1000) as never;
  });

  onDestroy(() => clearInterval(interval));
</script>

<Button {...props} disabled={time !== 0}
  >{text}
  {#if time !== 0}
    ({time})
  {/if}</Button
>
