<script lang="ts">
  import { Button, Heading, HStack, Stack, Text } from "@immich/ui";
  import type { Snippet } from "svelte";
  import UpsellFutoBackupsBadge from "../upsell/UpsellFutoBackupsBadge.svelte";

  type Props = {
    title: string;
    description: string;
    actionLabel: string;
    onAction: () => void;
    actionDisabled?: boolean;
    actionLoading?: boolean;
    secondaryLabel?: string;
    onSecondary?: () => void;
    children?: Snippet;
  };

  const {
    title,
    description,
    actionLabel,
    onAction,
    actionDisabled = false,
    actionLoading = false,
    secondaryLabel,
    onSecondary,
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

  <HStack gap={2}>
    <Button
      shape="round"
      disabled={actionDisabled}
      loading={actionLoading}
      onclick={onAction}
    >
      {actionLabel}
    </Button>

    {#if secondaryLabel && onSecondary}
      <Button
        shape="round"
        variant="ghost"
        color="secondary"
        disabled={actionLoading}
        onclick={onSecondary}
      >
        {secondaryLabel}
      </Button>
    {/if}
  </HStack>
</Stack>
