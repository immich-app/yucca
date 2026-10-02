<script module lang="ts">
  export type TileColor = "primary" | "success" | "warning" | "danger";

  export const tints: Record<TileColor, string> = {
    primary: "bg-primary-50 text-primary",
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-800",
    danger: "bg-danger-50 text-danger-700",
  };
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    color?: TileColor;
    children: Snippet;
  };

  const { color = "primary", children }: Props = $props();
</script>

<div
  class={`flex size-10 shrink-0 items-center justify-center rounded-lg text-xl ${tints[color]}`}
>
  {@render children()}
</div>
