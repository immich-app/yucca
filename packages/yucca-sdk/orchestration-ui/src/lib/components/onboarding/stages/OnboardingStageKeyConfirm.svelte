<script lang="ts">
  import {
    Button,
    Field,
    HStack,
    Input,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";

  type Props = {
    code: string;

    onConfirmKey: () => Promise<void>;
    onBack: () => void;
    onCancel: () => void;
  };

  const { code, onConfirmKey, onBack, onCancel }: Props = $props();

  let value = $state("");

  const strip = (key: string) => {
    return key.replace(/\s/g, "").toLowerCase().trim();
  };
</script>

<Modal
  size="small"
  title="Confirm recovery key"
  onClose={onCancel}
  icon={false}
>
  <ModalBody>
    <Stack>
      <Text size="small" class="text-muted text-left"
        >Ensure you've saved the key properly.</Text
      >

      <Field label="Recovery Key">
        <Input bind:value />
      </Field>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button disabled={strip(code) !== strip(value)} onclick={onConfirmKey}
        >Confirm</Button
      >
      <Button variant="ghost" onclick={onBack}>See the key again</Button>
    </HStack>
  </ModalFooter>
</Modal>
