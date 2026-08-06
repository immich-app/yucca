<script lang="ts">
  import { Icon } from "@immich/ui";
  import { mdiChevronRight } from "@mdi/js";
  import type { Snippet } from "svelte";
  import StackListItem from "./StackListItem.svelte";

  type Props = {
    title: string;
    icon?: Snippet;
    children: Snippet;
    disabled?: boolean;
    onclick: () => void;
  };

  const { title, icon, children, disabled = false, onclick }: Props = $props();
</script>

<button
  type="button"
  {disabled}
  {onclick}
  class="block w-full cursor-pointer text-left hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
>
  <StackListItem {title} {icon}>
    {@render children()}

    {#snippet trailing()}
      {#if !disabled}
        <Icon icon={mdiChevronRight} />
      {/if}
    {/snippet}
  </StackListItem>
</button>
