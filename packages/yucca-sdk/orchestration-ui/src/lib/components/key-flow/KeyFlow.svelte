<script lang="ts">
  import {
    Button,
    Card,
    CardBody,
    Field,
    Heading,
    HStack,
    Icon,
    Input,
    Modal,
    ModalBody,
    ModalFooter,
    Text,
    VStack,
  } from "@immich/ui";
  import { mdiImageAlbum, mdiInformation, mdiLock } from "@mdi/js";
  import TimedButton from "./TimedButton.svelte";

  let stage = $state(0);
  let value = $state("");

  const code = `ABCD EFGH IJKL MNOP
QRST UVWX YZAB CDEF
ABCD EFGH IJKL MNOP
QRST UVWX YZAB CDEF`;

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

  const strip = (key: string) => {
    return key.replace(/\s/g, "").trim();
  };
</script>

<Button onclick={() => (stage = 1)}>Open key flow</Button>

{#if stage === 1}
  <Modal size="small" title="Welcome to backups" onClose={() => (stage = 0)}>
    <ModalBody>
      <VStack>
        <HStack>
          <Icon icon={mdiImageAlbum} class="shrink-0 place-self-start mt-1" />
          <Text>
            Keep your most precious memories safe and away from prying eyes.</Text
          >
        </HStack>
        <HStack>
          <Icon icon={mdiLock} class="shrink-0 place-self-start mt-1" />
          <Text>
            You will be guided through setting up a secure way to keep your
            photos private.</Text
          >
        </HStack>
        <HStack>
          <Icon icon={mdiInformation} class="shrink-0 place-self-start mt-1" />
          <Text>
            You'll be able to choose to use our backups service or your own
            storage.</Text
          >
        </HStack>
      </VStack>
    </ModalBody>
    <ModalFooter>
      <HStack>
        <Button onclick={() => stage++}>Next</Button>
        <Button variant="ghost" onclick={() => (stage = 0)}>Cancel</Button>
      </HStack>
    </ModalFooter>
  </Modal>
{:else if stage === 2}
  <Modal
    size="small"
    title="Keeping your photos private"
    onClose={() => (stage = 0)}
  >
    <ModalBody>
      <VStack>
        <Text class="text-center"
          >You are about to be given a code which you need to put in a safe
          place. It will be used to allow you to access your backups later.</Text
        >

        <Text class="text-center text-red-500"
          >If you lose it, you won't be able to access your photo backup!</Text
        >
      </VStack>
    </ModalBody>
    <ModalFooter>
      <HStack>
        <TimedButton text="Next" onclick={() => stage++} />
        <Button variant="ghost" onclick={() => (stage = 0)}>Cancel</Button>
      </HStack>
    </ModalFooter>
  </Modal>
{:else if stage === 3}
  <Modal size="small" title="Your recovery key" onClose={() => (stage = 0)}>
    <ModalBody>
      <VStack>
        <Card>
          <CardBody class="flex justify-center">
            <pre><code>{code}</code></pre>
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
        <Button onclick={() => stage++}>Next</Button>
        <Button variant="ghost" onclick={() => (stage = 0)}>Cancel</Button>
      </HStack>
    </ModalFooter>
  </Modal>
{:else if stage === 4}
  <Modal size="small" title="Confirm recovery key" onClose={() => (stage = 0)}>
    <ModalBody>
      <VStack>
        <Field label="Recovery Key">
          <Input bind:value />
        </Field>
      </VStack>
    </ModalBody>
    <ModalFooter>
      <HStack>
        <Button
          disabled={strip(code) !== strip(value)}
          onclick={() => {
            stage++;
            value = "";
          }}>Confirm</Button
        >
        <Button
          variant="ghost"
          onclick={() => {
            stage--;
            value = "";
          }}>See the key again</Button
        >
      </HStack>
    </ModalFooter>
  </Modal>
{:else if stage === 5}
  <Modal size="small" title="Backup options" onClose={() => (stage = 0)}>
    <ModalBody>
      <VStack>
        <Card>
          <CardBody>
            <Heading size="small">$0/TB per month</Heading>
            <Text>Backups powered by FUTO</Text>
            <Text>Alerts and monitoring included</Text>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Heading size="small">Self-managed</Heading>
            <Text>Hook up your own S3 provider</Text>
          </CardBody>
        </Card>
      </VStack>
    </ModalBody>
    <ModalFooter>
      <HStack>
        <Button
          variant="ghost"
          onclick={() => {
            stage = 0;
          }}>Cancel</Button
        >
      </HStack>
    </ModalFooter>
  </Modal>
{/if}
