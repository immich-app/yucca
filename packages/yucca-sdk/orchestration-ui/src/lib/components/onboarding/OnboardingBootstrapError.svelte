<script lang="ts">
  import {
    Button,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import { useReportError } from "$lib/services/onboarding.service";

  type Props = {
    error?: string;
    onQuit: () => void;
  };

  const { error, onQuit }: Props = $props();

  const mutation = useReportError();

  const onReportAndQuit = () =>
    mutation.mutate(undefined, { onSuccess: onQuit });
</script>

<Modal size="small" title="Something went wrong" onClose={onQuit} icon={false}>
  <ModalBody>
    <Stack>
      <Text>We ran into an error setting up backups...</Text>
      {#if error}
        <Text size="small" color="danger" class="font-mono whitespace-pre-wrap"
          >{error}</Text
        >
      {/if}
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button
        color="danger"
        onclick={onReportAndQuit}
        loading={mutation.isPending}>Report error and quit</Button
      >
      <Button variant="ghost" onclick={onQuit} disabled={mutation.isPending}
        >Go back</Button
      >
    </HStack>
  </ModalFooter>
</Modal>
