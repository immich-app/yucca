<script lang="ts">
  import { Button, Heading, Stack, Text } from "@immich/ui";
  import type { Snippet } from "svelte";
  import UpsellFutoBackupsBadge from "../upsell/UpsellFutoBackupsBadge.svelte";

  type Props = {
    title: string;
    description: string;
    actionLabel: string;
    onAction: () => void;
    actionDisabled?: boolean;
    children?: Snippet;
  };

  const {
    title,
    description,
    actionLabel,
    onAction,
    actionDisabled = false,
    children,
  }: Props = $props();
</script>

<Stack gap={5} class="py-2">
  <UpsellFutoBackupsBadge />

  <Stack gap={2}>
    <Heading size="medium" color="primary" fontWeight="bold">{title}</Heading>
    <Text>{description}</Text>
  </Stack>

  {#if children}
    {@render children()}
  {/if}

  <Button
    shape="round"
    class="self-start"
    disabled={actionDisabled}
    onclick={onAction}
  >
    {actionLabel}
  </Button>
</Stack>
