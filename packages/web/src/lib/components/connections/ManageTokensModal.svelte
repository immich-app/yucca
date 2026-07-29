<script lang="ts">
  import { handleError } from "$lib/utils/handle-error";
  import {
    createResticUrl,
    listResticTokens,
    revoke,
    type ResticTokenDto,
  } from "@futo-org/backups-api-client";
  import {
    Badge,
    Button,
    HStack,
    LoadingSpinner,
    modalManager,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
    toastManager,
  } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";
  import ResticResultModal from "./ResticResultModal.svelte";

  type Props = {
    onClose: () => void;
    repositoryId: string;
    repositoryName: string;
  };
  let { onClose, repositoryId, repositoryName }: Props = $props();

  let tokens = $state<ResticTokenDto[]>([]);
  let loading = $state(true);
  let busy = $state(false);

  const isActive = (token: ResticTokenDto) =>
    !token.revokedAt && new Date(token.expiresAt).getTime() > Date.now();

  const load = async () => {
    loading = true;
    try {
      tokens = (await listResticTokens(repositoryId)).tokens;
    } catch (error) {
      handleError(error, $t`Failed to load access keys`);
    } finally {
      loading = false;
    }
  };

  const onRevoke = async (jti: string) => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      await revoke(jti);
      toastManager.info($t`Access key revoked`);
      await load();
    } catch (error) {
      handleError(error, $t`Failed to revoke access key`);
    } finally {
      busy = false;
    }
  };

  const onRemint = async () => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      const { url } = await createResticUrl(repositoryId, {});
      await load();
      modalManager.open(ResticResultModal, { url, repositoryName });
    } catch (error) {
      handleError(error, $t`Failed to mint a new access key`);
    } finally {
      busy = false;
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleDateString();

  $effect(() => {
    void load();
  });
</script>

<Modal title={$t`Access keys — ${repositoryName}`} icon={false} {onClose}>
  <ModalBody>
    {#if loading}
      <HStack><LoadingSpinner /></HStack>
    {:else if tokens.length === 0}
      <Text color="muted">{$t`No access keys yet.`}</Text>
    {:else}
      <Stack gap={0} class="divide-y rounded-2xl border overflow-hidden">
        {#each tokens as token (token.jti)}
          <HStack class="justify-between p-3">
            <Stack gap={0}>
              <Text>{token.label ?? $t`Access key`}</Text>
              <Text size="tiny" color="muted">
                {$t`Created ${formatDate(token.createdAt)} · expires ${formatDate(token.expiresAt)}`}
              </Text>
            </Stack>
            {#if isActive(token)}
              <Button
                size="tiny"
                shape="round"
                color="danger"
                variant="outline"
                disabled={busy}
                onclick={() => onRevoke(token.jti)}>{$t`Revoke`}</Button
              >
            {:else}
              <Badge color="secondary"
                >{token.revokedAt ? $t`Revoked` : $t`Expired`}</Badge
              >
            {/if}
          </HStack>
        {/each}
      </Stack>
    {/if}
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth gap={2}>
      <Button shape="round" color="secondary" fullWidth onclick={onClose}
        >{$t`Close`}</Button
      >
      <Button shape="round" fullWidth disabled={busy} onclick={onRemint}
        >{$t`New access key`}</Button
      >
    </HStack>
  </ModalFooter>
</Modal>
