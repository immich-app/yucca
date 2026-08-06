<script lang="ts">
  type Props = {
    step: number;
    size?: "small" | "medium";
  };

  const { step, size = "medium" }: Props = $props();

  const sizes = {
    small: "size-5 text-xs",
    medium: "size-8 text-lg",
  };
</script>

<span
  class={`bg-primary text-light flex shrink-0 items-center justify-center rounded-full tabular-nums ${sizes[size]}`}
  aria-hidden="true"
>
  {step}
</span>
