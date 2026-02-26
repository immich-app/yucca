<script lang="ts">
  import { createBackup, type LocalRepositoryDto } from "$lib/fetch-client";
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardFooter,
    FormatBytes,
    Heading,
    HStack,
    modalManager,
    toastManager,
  } from "@immich/ui";
  import { DateTime } from "luxon";
  import RunHistoryModal from "./dialogs/RunHistoryModal.svelte";
  import ConfigureRepositoryModal from "./dialogs/ConfigureRepositoryModal.svelte";
  import SnapshotsListModal from "./dialogs/SnapshotsListModal.svelte";
  import ViewLogModal from "./dialogs/ViewLogModal.svelte";

  type Props = {
    repository: LocalRepositoryDto;
    onUpdate: (partial: Partial<LocalRepositoryDto>) => void;
  };

  const { repository, onUpdate }: Props = $props();

  const onBackupNow = async () => {
    toastManager.info("Started backup");

    try {
      const { logId } = await createBackup(repository.id);
      modalManager.open(ViewLogModal, {
        logId,
      });
    } catch (error) {
      toastManager.danger(`Backup failed: ${error}`);
    }
  };

  const onViewHistory = () =>
    modalManager.open(RunHistoryModal, {
      repository,
    });

  const onViewSnapshots = () =>
    modalManager.open(SnapshotsListModal, {
      repository,
    });

  const onConfigure = () =>
    modalManager.open(ConfigureRepositoryModal, {
      repository: {
        ...repository,
        configuration: repository.configuration!,
      },
      onUpdate,
    });
</script>

<Card
  color={repository.backends && !repository.backends.primary.online
    ? "danger"
    : undefined}
>
  <CardBody class="flex gap-2">
    <HStack>
      {#if repository.backends}
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
      {:else}
        <Badge size="tiny" color="warning">Never backed up</Badge>
      {/if}
    </HStack>

    <Heading>{repository.name}</Heading>
  </CardBody>
  {#if repository.backends}
    <CardFooter class="flex gap-2">
      {#if repository.backends.primary.online}
        <Button size="tiny" onclick={onBackupNow}>Backup Now</Button>
      {/if}
      <Button size="tiny" onclick={onViewSnapshots}>Snapshots</Button>
      <Button size="tiny" onclick={onViewHistory}>Logs</Button>
      <Button size="tiny" onclick={onConfigure}>Configure</Button>
    </CardFooter>
  {:else}
    <CardFooter class="flex gap-2">
      <Button size="tiny">Import</Button>
    </CardFooter>
  {/if}
</Card>
