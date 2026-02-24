<script lang="ts">
  import {
    Button,
    Field,
    HStack,
    Input,
    Modal,
    ModalBody,
    ModalFooter,
    VStack,
  } from "@immich/ui";

  type Props = {
    code: string;

    onNext: () => void;
    onBack: () => void;
    onCancel: () => void;
  };

  const { code, onNext, onBack, onCancel }: Props = $props();

  let value = $state("");

  const strip = (key: string) => {
    return key.replace(/\s/g, "").trim();
  };
</script>

<Modal size="small" title="Confirm recovery key" onClose={onCancel}>
  <ModalBody>
    <VStack>
      <Field label="Recovery Key">
        <Input bind:value />
      </Field>
    </VStack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button disabled={strip(code) !== strip(value)} onclick={onNext}
        >Confirm</Button
      >
      <Button variant="ghost" onclick={onBack}>See the key again</Button>
    </HStack>
  </ModalFooter>
</Modal>
