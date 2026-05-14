<script lang="ts">
  import {
    Button,
    Card,
    CardBody,
    HStack,
    LoadingSpinner,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
    VStack,
  } from "@immich/ui";
  import { mdiAsterisk, mdiContentCopy, mdiFile, mdiPrinter } from "@mdi/js";

  type Props = {
    code: string;

    onNext: () => void;
    onCancel: () => void;
  };

  const { code: actualCode, onNext, onCancel }: Props = $props();

  const code = $derived(
    actualCode
      .toUpperCase()
      .match(/.{1,16}/g)!
      .map((line) => line.match(/.{1,4}/g)!.join(" "))
      .join("\n"),
  );

  const print = () => window.print();

  const saveFile = async () => {
    const saveWithFilePicker = (
      window as never as { showSaveFilePicker: Function }
    ).showSaveFilePicker;
    if (saveWithFilePicker) {
      const handle = await saveWithFilePicker({
        suggestedName: "backups-recovery-code.txt",
        types: [{ accept: { "text/plain": [".txt"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(code);
      await writable.close();
    } else {
      const blob = new Blob([code], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "backups-recovery-code.txt";
      a.click();

      URL.revokeObjectURL(url);
    }
  };

  const copyToClipboard = () => navigator.clipboard.writeText(code);

  const PasswordCredential =
    typeof window !== "undefined"
      ? (window as never as { PasswordCredential: any }).PasswordCredential
      : undefined;

  const storeCredentials = async () => {
    if (PasswordCredential) {
      const cred = new PasswordCredential({
        id: "Backups Recovery Code",
        password: code,
        name: "Backups Recovery Code",
      });

      await navigator.credentials.store(cred);
    }
  };
</script>

<Modal size="small" title="Your recovery key" onClose={onCancel} icon={false}>
  <ModalBody>
    <Stack gap={4}>
      <Text size="small" class="text-muted text-left"
        >Save this key somewhere safe, it will be used to restore your backups.</Text
      >

      <Card class="bg-primary-50 shadow-none">
        <CardBody class="flex justify-center">
          {#if code}
            <pre><code>{code}</code></pre>
          {:else}
            <LoadingSpinner />
          {/if}
        </CardBody>
      </Card>

      <VStack>
        <HStack>
          <Button leadingIcon={mdiPrinter} variant="outline" onclick={print}
            >Print</Button
          >
          <Button leadingIcon={mdiFile} variant="outline" onclick={saveFile}
            >Save as file</Button
          >
        </HStack>
        <Button
          leadingIcon={mdiContentCopy}
          variant="outline"
          onclick={copyToClipboard}>Copy to clipboard</Button
        >
        {#if PasswordCredential}
          <Button
            leadingIcon={mdiAsterisk}
            variant="outline"
            onclick={storeCredentials}>Save to password manager</Button
          >
        {/if}
      </VStack>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button onclick={onNext}>Next</Button>
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
