<script lang="ts">
  import { handleYuccaLogin } from "$lib/services/backend.service";
  import {
    Button,
    Card,
    CardBody,
    Heading,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Text,
    VStack,
  } from "@immich/ui";

  type Props = {
    restore?: boolean;
    onCancel: () => void;
  };

  const { restore = false, onCancel }: Props = $props();
</script>

<Modal
  size="small"
  title={restore ? "Where would you like to restore from?" : "Backup options"}
  onClose={onCancel}
>
  <ModalBody>
    <VStack>
      <Card class="cursor-pointer" onclick={handleYuccaLogin}>
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
    </VStack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
