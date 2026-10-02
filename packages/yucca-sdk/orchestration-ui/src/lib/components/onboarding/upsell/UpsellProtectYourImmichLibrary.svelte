<script lang="ts">
  import { Button, Heading, HStack, Icon, Stack, Text } from "@immich/ui";
  import { mdiCheckCircle } from "@mdi/js";
  import UpsellFutoBackupsBadge from "./UpsellFutoBackupsBadge.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onGetStarted: () => void;
    onLearnMore: () => void;
  };

  const { onGetStarted, onLearnMore }: Props = $props();

  const benefits = $derived([
    $t`Automatic backups run in the background`,
    $t`Encrypted backups protect your data`,
    $t`Restore from backup snapshots when needed`,
  ]);
</script>

<Stack gap={6}>
  <UpsellFutoBackupsBadge />

  <Stack gap={4}>
    <Heading tag="h2" size="medium" color="primary" fontWeight="bold"
      >{$t`Protect your Immich library`}</Heading
    >

    <Text>
      {$t`FUTO Backups adds backup support to your existing Immich setup, giving you more ways to protect your library if something goes wrong.`}
    </Text>
  </Stack>

  <Stack gap={2}>
    {#each benefits as benefit (benefit)}
      <HStack gap={3} class="items-center">
        <Icon
          icon={mdiCheckCircle}
          size="1.4em"
          class="text-primary shrink-0"
        />
        <Text>{benefit}</Text>
      </HStack>
    {/each}
  </Stack>

  <HStack gap={6} wrap class="items-center">
    <Button shape="round" onclick={onGetStarted}>{$t`Get Started`}</Button>
    <Button variant="ghost" shape="round" onclick={onLearnMore}>
      {$t`Learn More`}
    </Button>
  </HStack>
</Stack>
