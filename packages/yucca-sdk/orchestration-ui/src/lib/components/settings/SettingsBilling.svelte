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
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onManageBilling: () => void;
  };

  const { onManageBilling }: Props = $props();
</script>

<Accordion
  title={$t`Billing`}
  subtitle={$t`Manage your FUTO Backups subscription and billing.`}
  icon={mdiCreditCardOutline}
>
  <Stack gap={4} class="pt-2">
    <Accordion
      headingTag="h3"
      title={$t`FUTO Backups`}
      subtitle={$t`Hosted cloud backup storage for your Immich library.`}
      isOpen
    >
      <Stack gap={4} class="pt-2">
        <HStack gap={4} class="items-start justify-between">
          <Stack gap={0}>
            <Label label={$t`Status`} color="primary" />
            <Text size="small" color="muted">
              {$t`Connection state for your backup storage.`}
            </Text>
          </Stack>

          <Badge color="primary">{$t`Active`}</Badge>
        </HStack>

        <Field
          label={$t`Storage Used`}
          description={$t`How much storage your backups are using.`}
          color="primary"
          readOnly
        >
          <Input value="100 GiB" />
        </Field>

        <Field
          label={$t`Next Billing Date`}
          description={$t`When your next FUTO Backups charge will occur.`}
          color="primary"
          readOnly
        >
          <Input value="August 20, 2026" />
        </Field>
      </Stack>
    </Accordion>

    <HStack class="justify-end">
      <Button shape="round" onclick={onManageBilling}>{$t`Manage billing`}</Button>
    </HStack>
  </Stack>
</Accordion>
