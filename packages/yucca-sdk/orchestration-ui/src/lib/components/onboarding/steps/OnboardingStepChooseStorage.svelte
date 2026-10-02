<script lang="ts">
  import { Button, Heading, HStack, Icon, Stack, Text } from "@immich/ui";
  import { mdiCheckCircle, mdiCloseCircle } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";
  import OnboardingStepLayout from "./OnboardingStepLayout.svelte";

  type Props = {
    onConfirm: () => void;
  };

  const { onConfirm }: Props = $props();

  const features = $derived([$t`Subscription`, $t`FUTO Account`, $t`Hosted`]);

  const options = $derived([
    {
      title: $t`FUTO Cloud`,
      description: $t`Hosted cloud backup storage from FUTO.`,
      available: true,
    },
    {
      title: $t`S3 Bucket`,
      description: $t`Store backups on storage you manage.`,
      available: false,
    },
    {
      title: $t`Buddy Backups`,
      description: $t`Store backups on storage shared by someone you trust.`,
      available: false,
    },
  ]);
</script>

<OnboardingStepLayout
  description={$t`Select where a copy of your Immich library should be stored.`}
  actions={[]}
  badge={false}
>
  <div class="grid gap-6 md:grid-cols-3">
    {#each options as option (option.title)}
      <Stack
        gap={6}
        class="rounded-2xl border p-6 {option.available
          ? 'border-primary border-2'
          : 'border-primary/30'}"
      >
        <Stack gap={1}>
          <Heading tag="h3" size="tiny" fontWeight="semi-bold"
            >{option.title}</Heading
          >
          <Text>{option.description}</Text>
        </Stack>

        <Stack gap={2} class="grow">
          {#each features as feature (feature)}
            <HStack gap={3} class="items-center">
              <Icon
                icon={option.available ? mdiCheckCircle : mdiCloseCircle}
                title={option.available ? $t`Included` : $t`Not included`}
                size="1.5em"
                class="shrink-0 {option.available
                  ? 'text-primary'
                  : 'text-primary/40'}"
              />
              <Text>{feature}</Text>
            </HStack>
          {/each}
        </Stack>

        {#if option.available}
          <Button shape="round" fullWidth onclick={onConfirm}
            >{$t`Confirm`}</Button
          >
        {:else}
          <Button shape="round" variant="outline" fullWidth disabled
            >{$t`Coming soon`}</Button
          >
        {/if}
      </Stack>
    {/each}
  </div>
</OnboardingStepLayout>
