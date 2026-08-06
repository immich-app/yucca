<script lang="ts">
  import StepNumber from "$lib/components/ui/StepNumber.svelte";
  import { Card, CardBody, HStack, Stack, Text } from "@immich/ui";

  const steps = [
    {
      title: "Connect your FUTO account",
      description: "Securely connect FUTO Backups to Immich.",
    },
    {
      title: "Save your recovery key",
      description:
        "Your backup is encrypted and requires your recovery key to restore.",
    },
    {
      title: "Start backup",
      description: "Use recommended settings or customise later.",
    },
  ];

  type Props = {
    color?: "primary" | "secondary";
  };

  const { color = "primary" }: Props = $props();
</script>

<Card class="shadow-none border-none max-w-96" {color}>
  <CardBody class="p-8">
    <Stack gap={6}>
      <Text size="large" fontWeight="semi-bold">How it works</Text>

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
