<script lang="ts">
  import {
    Alert,
    Button,
    Code,
    HStack,
    IconButton,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
    toastManager,
  } from "@immich/ui";
  import { mdiContentCopy } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onClose: () => void;
    url: string;
    repositoryName: string;
  };
  let { onClose, url, repositoryName }: Props = $props();

  const initCommand = $derived(`restic -r "${url}" init`);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toastManager.info($t`Copied to clipboard`);
    } catch {
      // Insecure context or clipboard permission denied — the <Code> block is
      // select-all, so manual copy still works.
      toastManager.danger($t`Couldn't copy — select the text manually`);
    }
  };
</script>

<Modal title={$t`Restic backup ready`} icon={false} {onClose}>
  <ModalBody>
    <Stack gap={5}>
      <Stack gap={1}>
        <Text>{$t`Repository`}</Text>
        <Text size="large">{repositoryName}</Text>
      </Stack>

      <Stack gap={2}>
        <Text>{$t`Repository URL`}</Text>
        <HStack gap={2} class="items-start">
          <Code class="grow break-all select-all">{url}</Code>
          <IconButton
            color="secondary"
            variant="outline"
            icon={mdiContentCopy}
            aria-label={$t`Copy URL`}
            onclick={() => copy(url)}
          />
        </HStack>
      </Stack>

      <Stack gap={2}>
        <Text>{$t`Initialize the repository`}</Text>
        <HStack gap={2} class="items-start">
          <Code class="grow break-all select-all">{initCommand}</Code>
          <IconButton
            color="secondary"
            variant="outline"
            icon={mdiContentCopy}
            aria-label={$t`Copy command`}
            onclick={() => copy(initCommand)}
          />
        </HStack>
      </Stack>

      <Alert color="warning" title={$t`Choose a strong repository password`}>
        {$t`restic will ask you to set a password when you initialize. Keep it safe — it encrypts your backups and cannot be recovered.`}
      </Alert>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <Button shape="round" fullWidth onclick={onClose}>{$t`Done`}</Button>
  </ModalFooter>
</Modal>
