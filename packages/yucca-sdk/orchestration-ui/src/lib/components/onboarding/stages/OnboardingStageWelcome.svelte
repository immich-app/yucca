<script lang="ts">
  import {
    Button,
    HStack,
    Icon,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiImageAlbum, mdiInformation, mdiLock } from "@mdi/js";

  type Props = {
    onNext: () => void;
    onImportKey: () => void;
    onCancel: () => void;
    icon?: boolean;
  };

  const { onNext, onImportKey, onCancel, icon = true }: Props = $props();
</script>

<Modal size="small" title="Welcome to FUTO Backups" onClose={onCancel} {icon}>
  <ModalBody>
    <Stack>
      <HStack>
        <Icon icon={mdiImageAlbum} class="shrink-0 place-self-start mt-1" />
        <Text>
          Keep your most precious memories safe and away from prying eyes.</Text
        >
      </HStack>
      <HStack>
        <Icon icon={mdiLock} class="shrink-0 place-self-start mt-1" />
        <Text>
          You will be guided through setting up a secure way to keep your photos
          private.</Text
        >
      </HStack>
      <HStack>
        <Icon icon={mdiInformation} class="shrink-0 place-self-start mt-1" />
        <Text>
          You'll be able to choose to use our backups service or your own
          storage.</Text
        >
      </HStack>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button onclick={onNext}>Next</Button>
      <Button variant="ghost" onclick={onImportKey}>Import Key</Button>
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
