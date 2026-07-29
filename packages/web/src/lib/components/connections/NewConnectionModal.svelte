<script lang="ts">
  import {
    CONNECTION_TYPES,
    type ConnectionTypeMeta,
  } from "$lib/components/connections/connection-types";
  import {
    Badge,
    Button,
    Card,
    CardBody,
    HStack,
    Icon,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onClose: () => void;
    types: string[];
    onPick: (type: string) => void;
  };
  let { onClose, types, onPick }: Props = $props();

  const shown = $derived(
    CONNECTION_TYPES.filter((meta) => types.includes(meta.type)),
  );

  let selected = $state<ConnectionTypeMeta | undefined>(
    CONNECTION_TYPES.find((meta) => types.includes(meta.type) && meta.addable),
  );

  const proceed = () => {
    if (!selected) {
      return;
    }
    onPick(selected.type);
    onClose();
  };
</script>

<Modal title={$t`New connection`} icon={false} {onClose}>
  <ModalBody>
    <Stack gap={3}>
      <Text color="muted"
        >{$t`Pick what you want to back up. Each connection type works a little differently.`}</Text
      >

      {#each shown as meta (meta.type)}
        {@const disabled = !meta.addable}
        <Card
          class={disabled
            ? "opacity-60"
            : selected?.type === meta.type
              ? "ring-primary cursor-pointer ring-2"
              : "cursor-pointer"}
          onclick={disabled ? undefined : () => (selected = meta)}
        >
          <CardBody>
            <HStack gap={3} class="items-start">
              <Icon
                icon={meta.icon}
                size="1.75em"
                color={disabled ? "muted" : undefined}
              />
              <Stack gap={1}>
                <HStack gap={2}>
                  <Text size="large" color={disabled ? "muted" : undefined}
                    >{meta.label}</Text
                  >
                  {#if disabled}
                    <Badge color="secondary" size="small">{$t`Automatic`}</Badge
                    >
                  {/if}
                </HStack>
                <Text color="muted">{meta.description}</Text>
                <Text size="tiny" color="muted">{meta.limitation}</Text>
              </Stack>
            </HStack>
          </CardBody>
        </Card>
      {/each}
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth gap={2}>
      <Button shape="round" color="secondary" fullWidth onclick={onClose}
        >{$t`Cancel`}</Button
      >
      <Button
        shape="round"
        fullWidth
        disabled={!selected || !selected.addable}
        onclick={proceed}>{$t`Continue`}</Button
      >
    </HStack>
  </ModalFooter>
</Modal>
