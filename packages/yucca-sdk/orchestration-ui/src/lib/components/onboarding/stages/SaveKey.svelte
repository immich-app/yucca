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
    VStack,
  } from "@immich/ui";

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

<Modal size="small" title="Your recovery key" onClose={onCancel}>
  <ModalBody>
    <VStack>
      <Card>
        <CardBody class="flex justify-center">
          {#if code}
            <pre><code>{code}</code></pre>
          {:else}
            <LoadingSpinner />
          {/if}
        </CardBody>
      </Card>

      <HStack>
        <Button onclick={print}>Print</Button>
        <Button onclick={saveFile}>Save as file</Button>
      </HStack>
      <Button onclick={copyToClipboard}>Copy to clipboard</Button>
      {#if PasswordCredential}
        <Button onclick={storeCredentials}>Save to password manager</Button>
      {/if}
    </VStack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button onclick={onNext}>Next</Button>
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
