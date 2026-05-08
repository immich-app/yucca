<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { handleCreateBackup } from "$lib/services/repository.service";
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
  } from "@immich/ui";
  import {
    mdiCog,
    mdiFormatListBulletedType,
    mdiImport,
    mdiListStatus,
    mdiPlay,
  } from "@mdi/js";
  import RelativeTime from "../util/RelativeTime.svelte";
  import ConfigureRepositoryModal from "./dialogs/ConfigureRepositoryModal.svelte";
  import ImportRepositoryModal from "./dialogs/ImportRepositoryModal.svelte";
  import SnapshotsListModal from "./dialogs/SnapshotsListModal.svelte";
  import RunHistoryModal from "./run-history/RunHistoryModal.svelte";

  type Props = {
    repository: LocalRepositoryDto;
  };

  const { repository }: Props = $props();

  const onBackupNow = () => void handleCreateBackup(repository.id);

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

  const onImport = () =>
    modalManager.open(ImportRepositoryModal, {
      repository,
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
        <Heading size="small">{repository.name}</Heading>
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
          {#if repository.metrics.lastBackup && (!repository.metrics.lastSuccessfulBackup || +new Date(repository.metrics.lastBackup) > +new Date(repository.metrics.lastSuccessfulBackup))}
            <Badge size="tiny" color="danger">
              Failed <RelativeTime time={repository.metrics.lastBackup} />
            </Badge>
          {:else if repository.metrics.lastSuccessfulBackup}
            <Badge size="tiny" color="success">
              Successful <RelativeTime
                time={repository.metrics.lastSuccessfulBackup}
              />
            </Badge>
          {:else}
            <Badge size="tiny" color="warning">Never backed up</Badge>
          {/if}
        </HStack>
      </Stack>

      <HStack class="grow justify-end">
        {#if repository.configuration}
          {#if repository.backends!.primary.online}
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
        {:else if repository.backends}
          <IconButton aria-label="Import" icon={mdiImport} onclick={onImport} />
        {/if}
      </HStack>
    </HStack>
  </CardBody>
</Card>
