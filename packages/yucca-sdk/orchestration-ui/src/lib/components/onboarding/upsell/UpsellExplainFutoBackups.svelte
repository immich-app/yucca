<script lang="ts">
  import { Button, Heading, Icon, Stack, Text } from "@immich/ui";
  import { mdiCloudUpload } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onGetStarted: () => void;
  };

  const { onGetStarted }: Props = $props();
</script>

<Stack gap={6}>
  <Icon icon={mdiCloudUpload} size="5rem" class="text-primary" />

  <Heading tag="h1" size="large" fontWeight="normal">{$t`FUTO Backups`}</Heading>

  <Text>
    {$t`Keep your Immich library protected with backups stored locally, remotely, or in the cloud.`}
  </Text>

  <Button size="giant" shape="round" class="self-start" onclick={onGetStarted}>
    {$t`Get Started`}
  </Button>
</Stack>
