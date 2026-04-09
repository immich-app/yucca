<script lang="ts">
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
    onFinish: () => void;
    onCancel: () => void;
  };

  const { onFinish, onCancel }: Props = $props();

  const login = () => {
    const loginUrl = new URL("/api/auth/oidc/login", "http://localhost:22676");
    loginUrl.searchParams.set("next", window.location.href);
    window.location.href = loginUrl.href;
  };
</script>

<Modal size="small" title="Backup options" onClose={onCancel}>
  <ModalBody>
    <VStack>
      <Card class="cursor-pointer" onclick={login}>
        <CardBody>
          <Heading size="small">$0/TB per month</Heading>
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
