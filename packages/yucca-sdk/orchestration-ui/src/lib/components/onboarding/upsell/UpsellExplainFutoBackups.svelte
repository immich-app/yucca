<script lang="ts">
  import { Button, Heading, Icon, Stack, Text } from "@immich/ui";
  import { mdiCloudUpload } from "@mdi/js";

  type Props = {
    price: string;
    includedStorage: string;
    onGetStarted: () => void;
  };

  const { price, includedStorage, onGetStarted }: Props = $props();
</script>

<Stack gap={6}>
  <Icon icon={mdiCloudUpload} size="5rem" class="text-primary" />

  <Heading size="large" fontWeight="normal">FUTO Backups</Heading>

  <Text>
    Keep your Immich library safe with our secure, hosted backups solution.
  </Text>

  <Stack gap={0}>
    <Text size="small" color="muted">Starting at {price}/month</Text>
    <Text size="small" color="muted">
      Includes {includedStorage} of backup storage. Additional storage billed by usage.
    </Text>
  </Stack>

  <Button size="giant" shape="round" class="self-start" onclick={onGetStarted}>
    Get Started
  </Button>
</Stack>
