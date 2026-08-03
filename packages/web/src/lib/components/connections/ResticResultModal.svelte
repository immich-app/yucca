<script lang="ts">
  import {
    Alert,
    Button,
    Code,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
    toastManager,
  } from "@immich/ui";
  import { mdiCheck, mdiContentCopy } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onClose: () => void;
    url: string;
    repositoryName: string;
  };
  let { onClose, url, repositoryName }: Props = $props();

  const initCommand = $derived(`restic -r "${url}" init`);

  let copied = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      copied = id;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = null), 2000);
      toastManager.info($t`Copied to clipboard`);
    } catch {
      toastManager.danger($t`Couldn't copy. Select the text manually`);
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
        <HStack class="justify-between">
          <Text>{$t`Repository URL`}</Text>
          <Button
            size="tiny"
            shape="round"
            variant="outline"
            color={copied === "url" ? "success" : "secondary"}
            leadingIcon={copied === "url" ? mdiCheck : mdiContentCopy}
            onclick={() => copy("url", url)}
          >
            {copied === "url" ? $t`Copied` : $t`Copy`}
          </Button>
        </HStack>
        <Code class="break-all select-all">{url}</Code>
      </Stack>

      <Stack gap={2}>
        <HStack class="justify-between">
          <Text>{$t`Initialize the repository`}</Text>
          <Button
            size="tiny"
            shape="round"
            variant="outline"
            color={copied === "cmd" ? "success" : "secondary"}
            leadingIcon={copied === "cmd" ? mdiCheck : mdiContentCopy}
            onclick={() => copy("cmd", initCommand)}
          >
            {copied === "cmd" ? $t`Copied` : $t`Copy`}
          </Button>
        </HStack>
        <Code class="break-all select-all">{initCommand}</Code>
      </Stack>

      <Alert color="warning" title={$t`Choose a strong repository password`}>
        {$t`restic will ask you to set a password when you initialize. Keep it safe: it encrypts your backups and cannot be recovered.`}
      </Alert>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <Button shape="round" fullWidth onclick={onClose}>{$t`Done`}</Button>
  </ModalFooter>
</Modal>
