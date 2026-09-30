<script lang="ts">
  import { Button, Heading, HStack, Icon, Stack, Text } from "@immich/ui";
  import { mdiCheckCircle } from "@mdi/js";
  import UpsellFutoBackupsBadge from "./UpsellFutoBackupsBadge.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    price: string;
    onGetStarted: () => void;
    onLearnMore: () => void;
  };

  const { price, onGetStarted, onLearnMore }: Props = $props();

  const benefits = $derived([
    $t`Cloud copy while your originals stay local`,
    $t`Encrypted backups protect your data`,
    $t`Restore if your local storage fails`,
  ]);
</script>

<Stack gap={6}>
  <UpsellFutoBackupsBadge />

  <Stack gap={4}>
    <Heading size="medium" color="primary" fontWeight="bold"
      >{$t`Protect your Immich library`}</Heading
    >

    <Text>
      {$t`FUTO Backups adds hosted cloud backup storage to your existing Immich setup, so you have another copy if something happens locally.`}
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

  <Text fontWeight="semi-bold">
    {$t({
      message: "Starting at {price}/month. Additional storage billed by usage.",
      values: { price },
    })}
  </Text>

  <HStack gap={6} class="items-center">
    <Button shape="round" onclick={onGetStarted}>{$t`Get Started`}</Button>
    <Button variant="ghost" shape="round" onclick={onLearnMore}>
      {$t`Learn More`}
    </Button>
  </HStack>
</Stack>
