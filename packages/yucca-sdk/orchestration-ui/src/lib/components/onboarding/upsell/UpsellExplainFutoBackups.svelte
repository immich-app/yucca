<script lang="ts">
  import { Button, Heading, Icon, Stack, Text } from "@immich/ui";
  import { mdiCloudUpload } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    price: string;
    includedStorage: string;
    onGetStarted: () => void;
  };

  const { price, includedStorage, onGetStarted }: Props = $props();
</script>

<Stack gap={6}>
  <Icon icon={mdiCloudUpload} size="5rem" class="text-primary" />

  <Heading tag="h1" size="large" fontWeight="normal">{$t`FUTO Backups`}</Heading>

  <Text>
    {$t`Keep your Immich library safe with our secure, hosted backups solution.`}
  </Text>

  <Stack gap={0}>
    <Text size="small" color="muted">{$t({ message: "Starting at {price}/month", values: { price } })}</Text>
    <Text size="small" color="muted">
      {$t({
        message:
          "Includes {includedStorage} of backup storage. Additional storage billed by usage.",
        values: { includedStorage },
      })}
    </Text>
  </Stack>

  <Button size="giant" shape="round" class="self-start" onclick={onGetStarted}>
    {$t`Get Started`}
  </Button>
</Stack>
