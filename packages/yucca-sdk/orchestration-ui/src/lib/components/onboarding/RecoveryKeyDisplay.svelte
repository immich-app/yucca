<script lang="ts">
  import {
    Button,
    Card,
    CardBody,
    HStack,
    VStack,
  } from "@immich/ui";
  import { mdiAsterisk, mdiContentCopy, mdiFile, mdiPrinter } from "@mdi/js";

  type Props = {
    code: string;
  };

  const { code: actualCode }: Props = $props();

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

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "backups-recovery-code.txt";
      anchor.click();

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

<Card class="bg-primary-50 shadow-none">
  <CardBody class="flex justify-center">
    <pre><code>{code}</code></pre>
  </CardBody>
</Card>

<VStack>
  <HStack>
    <Button leadingIcon={mdiPrinter} variant="outline" onclick={print}>
      Print
    </Button>
    <Button leadingIcon={mdiFile} variant="outline" onclick={saveFile}>
      Save as file
    </Button>
  </HStack>
  <Button
    leadingIcon={mdiContentCopy}
    variant="outline"
    onclick={copyToClipboard}
  >
    Copy to clipboard
  </Button>
  {#if PasswordCredential}
    <Button
      leadingIcon={mdiAsterisk}
      variant="outline"
      onclick={storeCredentials}
    >
      Save to password manager
    </Button>
  {/if}
</VStack>
