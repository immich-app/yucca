<script lang="ts">
  import { HStack, Icon, Stack, Text } from "@immich/ui";
  import { mdiCheckCircle } from "@mdi/js";
  import OnboardingStepLayout from "./OnboardingStepLayout.svelte";

  type Props = {
    onConnect: () => void;
    onLocalStorage?: () => void;
  };

  const { onConnect, onLocalStorage }: Props = $props();

  const outcomes = [
    "Link this server to your FUTO Backups subscription",
    "Allow Immich to upload encrypted backups",
    "Return you here to finish setup",
  ];
</script>

<OnboardingStepLayout
  title="Connect your FUTO account"
  description="Connect your FUTO account to this Immich server so FUTO Backups can store your encrypted backups."
  actionLabel="Connect account"
  onAction={onConnect}
  secondaryLabel="Use local storage"
  onSecondary={onLocalStorage}
>
  <Stack gap={3}>
    <Text fontWeight="semi-bold" size="small">This will:</Text>

    {#each outcomes as outcome (outcome)}
      <HStack gap={3} class="items-center">
        <Icon
          icon={mdiCheckCircle}
          size="1.25rem"
          class="text-primary shrink-0"
        />
        <Text size="small">{outcome}</Text>
      </HStack>
    {/each}
  </Stack>
</OnboardingStepLayout>
