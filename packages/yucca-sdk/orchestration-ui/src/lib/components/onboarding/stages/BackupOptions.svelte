<script lang="ts">
  import { handleYuccaLogin } from "$lib/services/backend.service";
  import {
    Button,
    Card,
    CardBody,
    Heading,
    HStack,
    modalManager,
    Modal,
    ModalBody,
    ModalFooter,
    Text,
    VStack,
  } from "@immich/ui";
  import CreateLocalBackend from "$lib/components/backends/CreateLocalBackend.svelte";
  import OAuthDeviceFlow from "$lib/components/backends/OAuthDeviceFlow.svelte";

  type Props = {
    restore?: boolean;
    onNext: () => void;
    onCancel: () => void;
  };

  const { restore = false, onNext, onCancel }: Props = $props();

  async function onFutoBackups() {
    modalManager.show(OAuthDeviceFlow, {
      ...(await handleYuccaLogin()),
      onCreate: onNext,
    });
  }
</script>

<Modal
  size="small"
  title={restore ? "Where would you like to restore from?" : "Backup options"}
  onClose={onCancel}
>
  <ModalBody>
    <VStack>
      <Card class="cursor-pointer" onclick={onFutoBackups}>
        <CardBody>
          {#if restore}
            <Heading size="small">FUTO Backups</Heading>
          {:else}
            <Heading size="small">$0/TB per month</Heading>
          {/if}
          <Text>Backups powered by FUTO</Text>
          <Text>Alerts and monitoring included</Text>
        </CardBody>
      </Card>
      <!-- <Card class="cursor-pointer">
        <CardBody>
          <Heading size="small">Self-managed</Heading>
          <Text>Hook up your own S3 provider</Text>
        </CardBody>
      </Card> -->
      <Card
        class="cursor-pointer"
        onclick={() =>
          modalManager.open(CreateLocalBackend, {
            onCreated: onNext,
          })}
      >
        <CardBody>
          <Heading size="small">Local Folder</Heading>
          <Text>Select a local destination</Text>
        </CardBody>
      </Card>
    </VStack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
