<script lang="ts">
  import StepNumber from "$lib/components/ui/StepNumber.svelte";
  import { Card, CardBody, Heading, HStack, Stack, Text } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  const steps = $derived([
    {
      title: $t`Connect your FUTO account`,
      description: $t`Securely connect FUTO Backups to Immich.`,
    },
    {
      title: $t`Save your recovery key`,
      description: $t`Your backup is encrypted and requires your recovery key to restore.`,
    },
    {
      title: $t`Start backup`,
      description: $t`Use recommended settings or customise later.`,
    },
  ]);

  type Props = {
    color?: "primary" | "secondary";
  };

  const { color = "primary" }: Props = $props();
</script>

<Card class="shadow-none border-none max-w-96" {color}>
  <CardBody class="p-8">
    <Stack gap={6}>
      <Heading tag="h2" size="small" fontWeight="semi-bold">{$t`How it works`}</Heading>

      <Stack gap={4}>
        {#each steps as step, index (step.title)}
          <HStack gap={3} class="items-center">
            <StepNumber step={index + 1} />
            <Stack gap={0}>
              <Text fontWeight="semi-bold">{step.title}</Text>
              <Text color="muted">{step.description}</Text>
            </Stack>
          </HStack>
        {/each}
      </Stack>
    </Stack>
  </CardBody>
</Card>
