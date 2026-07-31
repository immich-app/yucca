<script lang="ts">
  import { Button, Heading, HStack, Icon, Stack, Text } from "@immich/ui";
  import { mdiCheckCircle } from "@mdi/js";
  import UpsellFutoBackupsBadge from "$lib/components/onboarding/upsell/UpsellFutoBackupsBadge.svelte";

  type Props = {
    placement?: "above" | "below";
    onSetUp: () => void;
    onClose: () => void;
  };

  const { placement = "above", onSetUp, onClose }: Props = $props();

  const benefits = [
    "A cloud copy while your originals stay local",
    "Encrypted before it ever leaves your server",
    "Restore your library if local storage fails",
  ];
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape") {
      onClose();
    }
  }}
/>

<div
  aria-label="About FUTO Backups"
  class="bg-light border-subtle absolute z-50 w-80 rounded-2xl border p-5 text-start shadow-2xl {placement ===
  'above'
    ? 'bottom-full mb-2'
    : 'top-full mt-2'}"
>
  <Stack gap={4}>
    <UpsellFutoBackupsBadge />

    <Stack gap={2}>
      <Heading size="tiny" color="primary" fontWeight="bold">
        Protect your Immich library
      </Heading>

      <Text size="small">
        Hosted cloud backup storage for your existing Immich setup, so you have
        another copy if something happens locally.
      </Text>
    </Stack>

    <Stack gap={2}>
      {#each benefits as benefit (benefit)}
        <HStack gap={2} class="items-start">
          <Icon
            icon={mdiCheckCircle}
            size="1.2em"
            class="text-primary mt-0.5 shrink-0"
          />
          <Text size="small">{benefit}</Text>
        </HStack>
      {/each}
    </Stack>

    <Stack gap={2}>
      <Button shape="round" size="small" fullWidth onclick={onSetUp}>
        Set up Backups
      </Button>
      <Button
        shape="round"
        size="small"
        fullWidth
        color="secondary"
        variant="ghost"
        onclick={onClose}
      >
        Not now
      </Button>
    </Stack>
  </Stack>
</div>
