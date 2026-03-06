<script lang="ts">
  import { createBackup, type LocalRepositoryDto } from "$lib/fetch-client";
  import {
    Badge,
    Card,
    CardBody,
    FormatBytes,
    Heading,
    HStack,
    IconButton,
    modalManager,
    Stack,
    toastManager,
  } from "@immich/ui";
  import RunHistoryModal from "./dialogs/RunHistoryModal.svelte";
  import ConfigureRepositoryModal from "./dialogs/ConfigureRepositoryModal.svelte";
  import SnapshotsListModal from "./dialogs/SnapshotsListModal.svelte";
  import ViewLogModal from "./dialogs/ViewLogModal.svelte";
  import {
    mdiCog,
    mdiFormatListBulletedType,
    mdiImport,
    mdiListStatus,
    mdiPlay,
  } from "@mdi/js";
  import RelativeTime from "../util/RelativeTime.svelte";

  type Props = {
    repository: LocalRepositoryDto;
  };

  const { repository }: Props = $props();

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
    });
</script>

<Card
  color={repository.backends && !repository.backends.primary.online
    ? "danger"
    : undefined}
>
  <CardBody>
    <HStack>
      <Stack>
        <Heading>{repository.name}</Heading>
        <HStack>
          {#if repository.backends}
            <Badge size="tiny" color="info">
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
          {#if repository.worm}
            <Badge size="tiny" color="info">WORM</Badge>
          {/if}
          <Badge size="tiny" color="secondary">
            <FormatBytes bytes={repository.metrics.sizeBytes} />
          </Badge>
          {#if repository.metrics.lastBackup}
            <Badge size="tiny" color={"success"}>
              Successful <RelativeTime time={repository.metrics.lastBackup} />
            </Badge>
          {:else}
            <Badge size="tiny" color="warning">Never backed up</Badge>
          {/if}
        </HStack>
      </Stack>

      <HStack class="grow justify-end">
        {#if repository.configuration}
          {#if repository.backends.primary.online}
            <IconButton
              onclick={onBackupNow}
              aria-label="Backup Now"
              icon={mdiPlay}
            />
            <IconButton
              onclick={onViewSnapshots}
              aria-label="Snapshots"
              icon={mdiFormatListBulletedType}
            />
          {/if}
          <IconButton
            onclick={onViewHistory}
            aria-label="Logs"
            icon={mdiListStatus}
          />
          <IconButton
            onclick={onConfigure}
            aria-label="Configure"
            icon={mdiCog}
          />
        {:else}
          <IconButton aria-label="Import" icon={mdiImport} />
        {/if}
      </HStack>
    </HStack>
  </CardBody>
</Card>
