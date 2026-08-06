<script lang="ts">
  import {
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    CardTitle,
    CloseButton,
    Icon,
    Logo,
    type ModalSize,
  } from "@immich/ui";
  import type { Snippet } from "svelte";

  type Props = {
    title?: string;
    icon?: string | boolean;
    size?: ModalSize;
    bodyClass?: string;
    header?: Snippet;
    children: Snippet;
    footer?: Snippet;
  };

  const {
    title,
    icon = true,
    size = "medium",
    bodyClass,
    header,
    children,
    footer,
  }: Props = $props();

  const widths: Record<ModalSize, string> = {
    tiny: "md:max-w-sm",
    small: "md:max-w-md",
    medium: "md:max-w-(--breakpoint-sm)",
    large: "md:max-w-(--breakpoint-md)",
    giant: "md:max-w-(--breakpoint-lg)",
    full: "w-full",
  };
</script>

<Card
  class="bg-light dark:bg-subtle border-subtle shadow-primary/20 mx-auto w-full rounded-2xl border shadow-sm dark:border-white/10 {widths[
    size
  ]}"
>
  {#if header}
    <CardHeader class="border-b-0 px-8 pt-4 pb-0">
      {@render header()}
    </CardHeader>
  {:else if title || icon}
    <CardHeader
      class="border-b border-gray-200 px-5 py-3 dark:border-white/10"
    >
      <div class="flex items-center justify-between gap-2">
        {#if typeof icon === "string"}
          <Icon {icon} size="1.5rem" aria-hidden="true" />
        {:else if icon}
          <Logo variant="icon" size="tiny" />
        {/if}
        <CardTitle tag="p" class="text-dark/90 grow text-lg font-semibold">
          {title ?? ""}
        </CardTitle>
        <CloseButton class="-me-2" onclick={() => void 0} />
      </div>
    </CardHeader>
  {/if}

  <CardBody class={`grow px-5 ${bodyClass ?? ""}`}>
    {@render children()}
  </CardBody>

  {#if footer}
    <CardFooter class="border-t border-gray-200 dark:border-white/10">
      {@render footer()}
    </CardFooter>
  {/if}
</Card>
