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
  import { Button, Heading, HStack, isEnabled, Stack, Text } from "@immich/ui";
  import type { Snippet } from "svelte";
  import UpsellFutoBackupsBadge from "../upsell/UpsellFutoBackupsBadge.svelte";

  type Props = {
    title: string;
    description: string;
    actions: OnboardingStepAction[];
    children?: Snippet;
  };

  const { title, description, actions, children }: Props = $props();

  const enabledActions = $derived(actions.filter(isEnabled));
  const busy = $derived(enabledActions.some((action) => action.loading));
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
