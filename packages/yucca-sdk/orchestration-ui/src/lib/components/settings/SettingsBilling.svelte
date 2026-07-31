<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import {
    Badge,
    Button,
    Field,
    HStack,
    Input,
    Label,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiCreditCardOutline } from "@mdi/js";

  type Props = {
    onManageBilling: () => void;
  };

  const { onManageBilling }: Props = $props();
</script>

<Accordion
  title="Billing"
  subtitle="Manage your FUTO Backups subscription and billing."
  icon={mdiCreditCardOutline}
>
  <Stack gap={4} class="pt-2">
    <Accordion
      title="FUTO Backups"
      subtitle="Hosted cloud backup storage for your Immich library."
      isOpen
    >
      <Stack gap={4} class="pt-2">
        <HStack gap={4} class="items-start justify-between">
          <Stack gap={0}>
            <Label label="Status" color="primary" />
            <Text size="small" color="muted">
              Connection state for your backup storage.
            </Text>
          </Stack>

          <Badge color="primary">Active</Badge>
        </HStack>

        <Field
          label="Storage Used"
          description="How much storage your backups are using."
          color="primary"
          readOnly
        >
          <Input value="100 GiB" />
        </Field>

        <Field
          label="Next Billing Date"
          description="When your next FUTO Backups charge will occur."
          color="primary"
          readOnly
        >
          <Input value="August 20, 2026" />
        </Field>
      </Stack>
    </Accordion>

    <HStack class="justify-end">
      <Button shape="round" onclick={onManageBilling}>Manage billing</Button>
    </HStack>
  </Stack>
</Accordion>
