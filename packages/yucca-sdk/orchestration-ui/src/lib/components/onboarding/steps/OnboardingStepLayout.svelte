<script module lang="ts">
  import type { ButtonProps, IfLike } from "@immich/ui";

  export type OnboardingStepAction = {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: ButtonProps["variant"];
    color?: ButtonProps["color"];
  } & IfLike;
</script>

<script lang="ts">
  import { Button, HStack, isEnabled, Stack, Text } from "@immich/ui";
  import type { Snippet } from "svelte";
  import UpsellFutoBackupsBadge from "../upsell/UpsellFutoBackupsBadge.svelte";

  type Props = {
    description?: string;
    actions: OnboardingStepAction[];
    badge?: boolean;
    children?: Snippet;
  };

  const {
    description,
    actions,
    badge = true,
    children,
  }: Props = $props();

  const enabledActions = $derived(actions.filter(isEnabled));
  const busy = $derived(enabledActions.some((action) => action.loading));
</script>

<Stack gap={5} class="py-2">
  {#if badge}
    <UpsellFutoBackupsBadge />
  {/if}

  {#if description}
    <Text>{description}</Text>
  {/if}

  {#if children}
    {@render children()}
  {/if}

  <HStack gap={2} wrap>
    {#each enabledActions as action, index (action.label)}
      <Button
        shape="round"
        variant={action.variant ?? (index === 0 ? "filled" : "ghost")}
        color={action.color ?? (index === 0 ? "primary" : "secondary")}
        disabled={action.disabled || (busy && !action.loading)}
        loading={action.loading}
        onclick={action.onClick}
      >
        {action.label}
      </Button>
    {/each}
  </HStack>
</Stack>
