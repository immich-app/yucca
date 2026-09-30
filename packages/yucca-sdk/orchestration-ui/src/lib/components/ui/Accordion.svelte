<script lang="ts">
  import { Icon, Text } from "@immich/ui";
  import { mdiChevronDown } from "@mdi/js";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { slide } from "svelte/transition";

  type Props = {
    title: string;
    subtitle?: string;
    icon?: string;
    isOpen?: boolean;
    headingTag?: "h2" | "h3" | "h4";
    children?: Snippet;
  };

  let {
    title,
    subtitle,
    icon,
    isOpen = $bindable(false),
    headingTag = "h2",
    children,
  }: Props = $props();

  const panelId = $props.id();
  const reducedMotion = new MediaQuery("prefers-reduced-motion: reduce");
</script>

<div
  class="border-primary/20 mt-4 rounded-2xl border-2 px-6 py-4 transition-all motion-reduce:transition-none"
  class:border-primary={isOpen}
  class:shadow-md={isOpen}
>
  <svelte:element this={headingTag}>
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={isOpen ? panelId : undefined}
      onclick={() => (isOpen = !isOpen)}
      class="flex w-full place-items-center justify-between gap-4 text-start"
    >
      <div>
        <div class="flex place-items-center gap-2">
          {#if icon}
            <Icon {icon} class="text-primary" size="1.5rem" aria-hidden="true" />
          {/if}
          <Text fontWeight="medium" color="primary">{title}</Text>
        </div>

        {#if subtitle}
          <Text size="small" color="muted" class="mt-1">{subtitle}</Text>
        {/if}
      </div>

      <div
        class="hover:bg-primary/10 flex shrink-0 place-content-center place-items-center rounded-full p-3 transition-all"
      >
        <Icon
          icon={mdiChevronDown}
          size="1.25rem"
          class="transition-transform duration-200 ease-in motion-reduce:transition-none {isOpen
            ? 'rotate-180'
            : ''}"
          aria-hidden="true"
        />
      </div>
    </button>
  </svelte:element>

  {#if isOpen}
    <div
      id={panelId}
      transition:slide={{ duration: reducedMotion.current ? 0 : 150 }}
      class="mb-2 ms-4"
    >
      {@render children?.()}
    </div>
  {/if}
</div>
