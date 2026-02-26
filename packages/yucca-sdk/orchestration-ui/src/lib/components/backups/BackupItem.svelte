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

  type Props = {
    repository: LocalRepositoryDto;
    onUpdate: (partial: Partial<LocalRepositoryDto>) => void;
  };

  const { repository, onUpdate }: Props = $props();

  const onBackupNow = async () => {
    toastManager.info("Started backup");

    try {
      await createBackup(repository.id);
      toastManager.success("Finished backup");
    } catch (error) {
      toastManager.danger(`Backup failed: ${error}`);
    }
  };

  const onViewHistory = () =>
    modalManager.open(RunHistoryModal, {
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

{#if repository.backends}
  <Card color={repository.backends.primary.online ? undefined : "danger"}>
    <CardBody class="flex gap-2">
      <HStack>
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
        {:else}
          <Badge size="tiny" color="warning">Never backed up</Badge>
        {/if}
      </HStack>

      <Heading>{repository.id}</Heading>
    </CardBody>
    <CardFooter class="flex gap-2">
      {#if repository.backends.primary.online}
        <Button size="tiny" onclick={onBackupNow}>Backup Now</Button>
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
