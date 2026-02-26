<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardFooter,
    FormatBytes,
    Heading,
    modalManager,
    toastManager,
  } from "@immich/ui";
  import { DateTime } from "luxon";
  import RunHistoryModal from "./dialogs/RunHistoryModal.svelte";
  import { getProvider } from "$lib/providers";
  import ConfigureRepositoryModal from "./dialogs/ConfigureRepositoryModal.svelte";

  type Props = {
    repository: LocalRepositoryDto;
    onUpdate: (partial: Partial<LocalRepositoryDto>) => void;
  };

  const { repository, onUpdate }: Props = $props();
  const provider = getProvider();

  const onBackup = async () => {
    toastManager.info("Started backup");
  };

  const onViewHistory = () =>
    modalManager.open(RunHistoryModal, {
      repository,
      provider,
    });

  const onConfigure = () =>
    modalManager.open(ConfigureRepositoryModal, {
      repository: {
        ...repository,
        configuration: repository.configuration!,
      },
      provider,
      onUpdate,
    });
</script>

{#if repository.backends}
  <Card color={repository.backends.primary.online ? undefined : "danger"}>
    <CardBody class="flex gap-2">
      <Badge size="tiny" color="secondary">
        {repository.backends.primary.type === "yucca"
          ? "FUTO Backups"
          : repository.backends.primary.type === "local"
            ? "Local Storage"
            : "S3 Server"}
      </Badge>
      {#if !repository.backends.primary.online}
        <Badge size="tiny" color="danger">Offline</Badge>
      {/if}
      <Badge size="tiny" color="secondary">
        <FormatBytes bytes={repository.metrics.sizeBytes} />
      </Badge>
      {#if repository.metrics.lastBackup}
        <Badge size="tiny" color={"success"}>
          Successful {DateTime.fromISO(
            repository.metrics.lastBackup,
          ).toRelative()}
        </Badge>
      {/if}

      <Heading>{repository.id}</Heading>
    </CardBody>
    <CardFooter class="flex gap-2">
      {#if repository.backends.primary.online}
        <Button size="tiny" onclick={onBackup}>Backup Now</Button>
      {/if}
      <Button size="tiny" onclick={onViewHistory}>Logs</Button>
      <Button size="tiny" onclick={onConfigure}>Configure</Button>
    </CardFooter>
  </Card>
{:else}
  <Card>
    <CardBody>
      <Heading>{repository.id}</Heading></CardBody
    >
    <CardFooter class="flex gap-2">
      <Button size="tiny">Import</Button>
    </CardFooter>
  </Card>
{/if}
